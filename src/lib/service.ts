import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { insertEntity, listEntities, transaction, type Entity, type EntityTable } from "./database";
import { readContext, seedScenario } from "./scenarios";
import { evaluatePractice, fingerprint, validateQuote, propose } from "./engine";
import type { Context, Review, Assessment, Fact, Outreach } from "./domain";
export class ConflictError extends Error {}
export interface Change { table: EntityTable; id: string; before: Entity | null; after: Entity | null }
export interface Audit extends Entity { action: string; actor: string; timestamp: string; reason: string; evidenceIds: string[]; reviewId: string | null; changes: Change[]; revertsEventId: string | null }
function get<T extends Entity>(db:DatabaseSync,table:EntityTable,ctx:Context,id:string):T {
 const result=listEntities(db,table,ctx.seller.id,ctx.company.id).find(x=>x.id===id);
 if(!result) throw new ConflictError("Record does not belong to this seller and prospect"); return result as T;
}
function write(db:DatabaseSync,table:EntityTable,entity:Entity) {
 const result=db.prepare(`UPDATE ${table} SET data=? WHERE seller_id=? AND company_id=? AND id=?`).run(JSON.stringify(entity),entity.sellerId,entity.companyId,entity.id);
 if(result.changes!==1) throw new ConflictError("The record is no longer available");
}
function audit(db:DatabaseSync,ctx:Context,action:string,reason:string,changes:Change[],reviewId:string|null=null,evidenceIds:string[]=[],revertsEventId:string|null=null) {
 const event:Audit={id:randomUUID(),sellerId:ctx.seller.id,companyId:ctx.company.id,action,actor:"Local operator",timestamp:new Date().toISOString(),reason,changes,reviewId,evidenceIds,revertsEventId};
 insertEntity(db,"audit",event);return event;
}
function stopOutreach(db:DatabaseSync,ctx:Context,sourceReplyId:string) {
 const changes:Change[]=[];
 for(const table of ["contacts","companies"] as const) {
  const entity=table==="contacts"?ctx.contact:ctx.company;
  // An individual stop request suppresses the replying contact, not every colleague.
  if(table==="companies"||entity.suppressed===true) continue;
  const next={...entity,suppressed:true};write(db,table,next);changes.push({table,id:entity.id,before:entity,after:next});
 }
 for(const message of ctx.outreach.filter(m=>m.contactId===ctx.contact.id&&["draft","queued","paused"].includes(m.status))) {
  if(message.status==="cancelled")continue;
  const next={...message,status:"cancelled",version:message.version+1};write(db,"outreach",next);changes.push({table:"outreach",id:message.id,before:message,after:next});
 }
 if(changes.length)audit(db,ctx,"opt_out","Buyer requested contact stop. Local outreach cancelled; no alternate pitch is allowed.",changes,null,[sourceReplyId]);
}
export type Evaluator=(context:Context,reply:string,support:boolean)=>Promise<Assessment>;
export async function evaluate(db:DatabaseSync,id:string,reply:string,support:boolean,mode:"practice"|"live"="practice",evaluator?:Evaluator,modelKey="practice-v1"):Promise<Review> {
 if(typeof reply!=="string"||!reply.trim()||reply.length>12000) throw new Error("Enter a reply between 1 and 12,000 characters");
 seedScenario(db,id);
 const start=performance.now();
 const sourceId=`reply-${createHash("sha256").update(id+reply).digest("hex")}`;
 let ctx=readContext(db,id);
 if(!ctx.messages.some(m=>m.id===sourceId)) transaction(db,()=>insertEntity(db,"messages",{id:sourceId,sellerId:ctx.seller.id,companyId:ctx.company.id,contactId:ctx.contact.id,conversationId:`conversation-${id}`,direction:"inbound",body:reply,timestamp:new Date().toISOString(),ingestionId:sourceId}));
 ctx=readContext(db,id);
 const key=createHash("sha256").update(fingerprint(ctx,reply,support)+mode+modelKey).digest("hex");
 const existing=listEntities(db,"reviews",ctx.seller.id,ctx.company.id).find(r=>r.cacheKey===key&&r.state!=="failed");
 if(existing)return existing as Review;
 let assessment:Assessment;
 if(mode==="live") {
  if(!evaluator) throw new Error("Live mode is not configured. Configure server-side OpenAI access; practice mode is available separately.");
  assessment=await evaluator(ctx,reply,support);
 } else assessment=evaluatePractice(ctx,reply,support).assessment;
 // Model output is constrained to scoped facts and exact source excerpts.
 for(const correction of assessment.corrections){
  validateQuote(correction.quote,reply);
  if(!ctx.facts.some(f=>f.id===correction.factId))throw new Error("Evaluation referenced unrelated research");
 }
 // Concurrent evaluation cannot silently authorize a changed context.
 const latest=readContext(db,id);
 if(fingerprint(latest,reply,support)!==fingerprint(ctx,reply,support))throw new ConflictError("Context changed during evaluation. Evaluate again.");
 const review=transaction(db,()=>{
  if(assessment.optOut)stopOutreach(db,ctx,sourceId);
  const current=readContext(db,id);
  const proposed=propose(current,assessment,support);
  if(current.contact.suppressed===true){proposed.actions=proposed.actions.filter(a=>a.type!=="rewrite");for(const impact of proposed.impacts)impact.rewriteEligible=false;}
  const result:Review={id:randomUUID(),sellerId:ctx.seller.id,companyId:ctx.company.id,sourceReplyId:sourceId,scenarioId:id,reply,hubspotSupported:support,assessment,...proposed,inputFingerprint:fingerprint(current,reply,support),cacheKey:createHash("sha256").update(fingerprint(current,reply,support)+mode+modelKey).digest("hex"),state:assessment.failure?"failed":"needs_review",createdAt:new Date().toISOString(),latencyMs:Math.round(performance.now()-start)};
  insertEntity(db,"reviews",result);return result;
 });return review;
}
export interface ApprovalInput { reviewId:string; scenarioId:string; reply:string; hubspotSupported:boolean; actionIds:string[]; edits?:Record<string,string> }
export function approve(db:DatabaseSync,input:ApprovalInput):Review {
 return transaction(db,()=>{
  const ctx=readContext(db,input.scenarioId),review=get<Review>(db,"reviews",ctx,input.reviewId);
  if(review.state==="approved")return review;
  if(review.state!=="needs_review")throw new ConflictError("This review can no longer be approved");
  if(input.reply!==review.reply||input.hubspotSupported!==review.hubspotSupported||fingerprint(ctx,input.reply,input.hubspotSupported)!==review.inputFingerprint)throw new ConflictError("This proposal is stale. Evaluate the current inputs again.");
  if(!Array.isArray(input.actionIds)||new Set(input.actionIds).size!==input.actionIds.length)throw new Error("Invalid action selection");
  if(input.actionIds.some(id=>!review.actions.some(a=>a.id===id)))throw new Error("Unknown proposed action");
  const selected=review.actions.filter(a=>input.actionIds.includes(a.id));
  const edits=input.edits||{};
  if(Object.keys(edits).some(id=>!selected.some(a=>a.id===id&&(a.type==="rewrite"||a.type==="update_fact"))))throw new Error("Edits must belong to selected repair actions");
  for(const text of Object.values(edits))if(typeof text!=="string"||!text.trim()||text.length>4000)throw new Error("Edited values must contain 1–4,000 characters");
  for(const action of selected) {
   if(action.dependsOn&&!input.actionIds.includes(action.dependsOn))throw new Error("Approve the linked fact correction before using this rewrite");
   if(action.factId&&action.type==="update_fact") {
    const fact=get<Fact>(db,"facts",ctx,action.factId);if(fact.version!==action.expectedVersion||fact.status==="superseded")throw new ConflictError("Research changed since this proposal was created");validateQuote(action.quote||"",review.reply);
   }
   if(action.messageId) {
    const message=get<Outreach>(db,"outreach",ctx,action.messageId);
    if(message.version!==action.expectedVersion||!["draft","queued","paused"].includes(message.status))throw new ConflictError("The follow-up changed or was already sent");
    if(action.type==="rewrite"&&(ctx.contact.suppressed===true||ctx.company.suppressed===true||!input.hubspotSupported))throw new ConflictError("This outreach is suppressed or the offer is unsupported");
   }
  }
  const changes:Change[]=[], newFactIds:Record<string,string>={}, evidenceIds:string[]=[];
  for(const action of selected) {
   if(action.type==="update_fact"&&action.factId) {
    const original=get<Fact>(db,"facts",ctx,action.factId);
    const evidence:Entity={id:randomUUID(),sellerId:ctx.seller.id,companyId:ctx.company.id,sourceType:"buyer_reply",sourceUrl:null,originalText:action.quote,imageReference:null,publishedAt:null,eventDate:null,checkedAt:new Date().toISOString(),speaker:String(ctx.contact.name),scope:action.scope,provenance:"Buyer-reported correction; not independently verified.",sourceReplyId:review.sourceReplyId};
    insertEntity(db,"evidence",evidence);changes.push({table:"evidence",id:evidence.id,before:null,after:evidence});evidenceIds.push(evidence.id);
    if(original.scope===action.scope) {
     const superseded={...original,status:"superseded",version:original.version+1};write(db,"facts",superseded);changes.push({table:"facts",id:original.id,before:original,after:superseded});
    }
    const replacement:Entity={...original,id:randomUUID(),value:edits[action.id]||action.newValue,scope:action.scope,contactId:action.scope==="contact"?ctx.contact.id:null,evidenceId:evidence.id,status:"active",version:1,recordedAt:new Date().toISOString(),checkedAt:new Date().toISOString(),supersedesFactId:original.scope===action.scope?original.id:null,relatedFactId:original.id,buyerReported:true};
    insertEntity(db,"facts",replacement);newFactIds[original.id]=replacement.id;changes.push({table:"facts",id:replacement.id,before:null,after:replacement});
   }
   if(action.messageId&&(action.type==="pause"||action.type==="rewrite")) {
    const original=get<Outreach>(db,"outreach",ctx,action.messageId);
    const replacement:Outreach={...original,status:"paused",version:original.version+1};
    if(action.type==="rewrite") {
     replacement.body=edits[action.id]||action.newBody||original.body;
     replacement.generatedSuggestion=true;
     replacement.factIds=original.factIds.map(id=>newFactIds[id]||id);
     replacement.claims=original.claims.map(c=>({...c,text:"Buyer-reported CRM is HubSpot",factIds:c.factIds.map(id=>newFactIds[id]||id)}));
    }
    write(db,"outreach",replacement);changes.push({table:"outreach",id:original.id,before:original,after:replacement});
   }
  }
  const approved:Review={...review,state:"approved",approvedBy:"Local operator",approvedAt:new Date().toISOString(),selectedActionIds:input.actionIds,operatorEdits:edits};write(db,"reviews",approved);
  audit(db,ctx,"approve","Operator approved individually selected local actions.",changes,review.id,evidenceIds);
  return approved;
 });
}
export function reject(db:DatabaseSync,id:string,reviewId:string):Review {
 return transaction(db,()=>{
  const ctx=readContext(db,id),review=get<Review>(db,"reviews",ctx,reviewId);
  if(review.state==="rejected")return review;if(review.state!=="needs_review")throw new ConflictError("This review has already been handled");
  const rejected:Review={...review,state:"rejected",approvedBy:"Local operator",approvedAt:new Date().toISOString()};write(db,"reviews",rejected);
  audit(db,ctx,"reject","Operator rejected the proposed repairs; any existing opt-out remains in effect.",[],review.id);return rejected;
 });
}
export function revert(db:DatabaseSync,id:string,eventId:string):Audit {
 return transaction(db,()=>{
  const ctx=readContext(db,id),event=get<Audit>(db,"audit",ctx,eventId);
  const previous=listEntities(db,"audit",ctx.seller.id,ctx.company.id).find(a=>a.revertsEventId===event.id);if(previous)return previous as Audit;
  if(event.action!=="approve"||!event.changes.length)throw new Error("Only an internal approved repair can be reverted. Opt-outs cannot be undone here.");
  // Consolidate repeated mutations to a message (pause then rewrite).
  const consolidated=new Map<string,Change>();
  for(const change of event.changes){const key=change.table+change.id,first=consolidated.get(key);consolidated.set(key,{...change,before:first?first.before:change.before});}
  for(const change of consolidated.values()) {
   const current=get(db,change.table,ctx,change.id);
   if(JSON.stringify(current)!==JSON.stringify(change.after))throw new ConflictError("A record changed after approval; this repair cannot be reverted safely");
  }
  const changes:Change[]=[];
  for(const change of [...consolidated.values()].reverse()) {
   if(change.before)write(db,change.table,change.before);
   else db.prepare(`DELETE FROM ${change.table} WHERE seller_id=? AND company_id=? AND id=?`).run(ctx.seller.id,ctx.company.id,change.id);
   changes.push({...change,before:change.after,after:change.before});
  }
  return audit(db,ctx,"revert","New audited action reverting an unchanged internal approved repair.",changes,event.reviewId,event.evidenceIds,event.id);
 });
}
export function recordFeedback(db:DatabaseSync,id:string,reviewId:string,kind:"missed_correction"|"incorrectly_flagged") {
 const ctx=readContext(db,id);get<Review>(db,"reviews",ctx,reviewId);
 if(!["missed_correction","incorrectly_flagged"].includes(kind))throw new Error("Unknown feedback type");
 return audit(db,ctx,kind,"Operator-reported quality feedback; not an independently measured model error.",[],reviewId);
}
