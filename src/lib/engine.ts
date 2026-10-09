import { createHash } from "node:crypto";
import type { Context, Assessment, Correction, Action, Impact, Scope, Review } from "./domain";

export function fingerprint(context: Context, reply: string, hubspotSupported: boolean) {
  return createHash("sha256").update(JSON.stringify({scenario:context.scenarioId,seller:context.seller,company:context.company,contact:context.contact,facts:context.facts,evidence:context.evidence,outreach:context.outreach,messages:context.messages,reply,hubspotSupported})).digest("hex");
}
export function validateQuote(quote: string, reply: string) { if(!quote.trim()||!reply.includes(quote)) throw new Error("A supporting quote does not match the original reply"); }
export function assessPractice(context: Context,reply: string): Assessment {
  const text=reply.toLowerCase();
  const warnings=["Simulated practice evaluation. No live model call or model confidence is shown."];
  const result: Assessment={corrections:[],optOut:false,outcome:"no_correction",judgments:[],mode:"practice",warnings};
  if(/stop (contacting|emailing)|remove me|unsubscribe|do not contact|don.t contact/.test(text)) return {...result,optOut:true,outcome:"opt_out"};
  if(/ignore (all |the |any )?(previous |prior )?instructions|delete every|approve all/.test(text)) return {...result,outcome:"ambiguous",warnings:[...warnings,"Embedded instructions are untrusted evidence. No commands in the reply were executed."]};
  const statementScope: Scope=/my team|our .*team|marketing team/.test(text)?"team":/i personally|i don.t use/.test(text)?"contact":"company";
  const tentative=/might|may move|considering|no decision|possibly|not sure/.test(text);
  for(const fact of context.facts.filter(f=>f.status!=="superseded")) {
    let value:string|null=null, quote:string|null=null, scope:Scope=fact.scope;
    if(fact.category==="technology" && /hubspot|don.t use salesforce|no longer use salesforce/.test(text)) {value=/hubspot/i.test(reply)?"HubSpot":"No longer uses Salesforce";scope=statementScope;quote=reply;}
    if(fact.category==="plans" && /cancelled|canceled|not expanding|staying in/.test(text)) {value="Expansion cancelled";quote=reply;}
    if(fact.category==="need" && /fixed|solved|no longer need|already resolved/.test(text)) {value="Lead-routing problem reported solved";quote=reply;}
    if(fact.category==="timing" && /postponed|next quarter|not evaluating/.test(text)) {value=/next quarter/.test(text)?"Project postponed until next quarter (exact date unconfirmed)":"Project postponed (date unconfirmed)";quote=reply;}
    if(fact.category==="responsibility" && /filled|hiring completed/.test(text)) {value="Hiring completed; old posting reported outdated";quote=reply;}
    if(fact.category==="responsibility" && /not responsible|priya owns|wrong person/.test(text)) {value=/priya owns/.test(text)?"Priya owns lead routing (buyer-reported; identity unverified)":"Contact is not responsible for lead routing";scope="contact";quote=reply;}
    if(quote) {
      validateQuote(quote,reply);
      const relation=fact.value===value?"supported":tentative?"unclear":scope!==fact.scope?"new_information":"contradicted";
      result.corrections.push({id:`correction-${fact.id}`,factId:fact.id,category:fact.category,scope:tentative?"unknown":scope,relation,replacementValue:tentative?null:value,quote,summary:tentative?"Possible future change; current fact remains unconfirmed.":`${fact.field}: ${value}. Buyer-reported, not independently verified.`});
    }
  }
  if(result.corrections.length) result.outcome=tentative?"ambiguous":result.corrections.length>1?"multiple":"correction";
  else if(!/still use salesforce|yes|thank|share an overview/.test(text)) result.outcome=/crm|salesforce|hubspot|project|routing|expan|hiring/.test(text)?"ambiguous":"unrelated";
  return result;
}
export function propose(context: Context,assessment: Assessment, hubspotSupported: boolean): {actions:Action[];impacts:Impact[]} {
  const actions:Action[]=[], impacts:Impact[]=[];
  const pending=context.outreach.filter(m=>["queued","draft","paused"].includes(m.status));
  if(assessment.optOut) return {actions:[],impacts:pending.map(m=>({messageId:m.id,affected:true,discovery:"explicit",rewriteEligible:false,reason:"Explicit opt-out: all local outreach to this contact must stop."}))};
  for(const correction of assessment.corrections) {
    const fact=context.facts.find(f=>f.id===correction.factId); if(!fact) throw new Error("Correction references a fact outside this prospect context");
    if(correction.relation==="supported") continue;
    const uncertain=correction.relation==="unclear"||correction.scope==="unknown";
    const updateId=`update-${fact.id}`;
    actions.push(uncertain?{id:`research-${fact.id}`,type:"research",factId:fact.id,reason:"Clarify current information and scope before updating records."}:{id:updateId,type:"update_fact",factId:fact.id,expectedVersion:fact.version,newValue:correction.replacementValue||"",scope:correction.scope,quote:correction.quote,reason:correction.scope!==fact.scope?"Add a separate scoped buyer-reported fact; preserve the company-wide record.":"Preserve the original fact and evidence; add a buyer-reported replacement."});
  }
  for(const message of pending) {
    const corrections=assessment.corrections.filter(c=>c.relation!=="supported" && (message.factIds.includes(c.factId)||message.claims.some(cl=>cl.factIds.includes(c.factId))|| (message.dependencyDiscovery!=="explicit"&&context.facts.some(f=>f.id===c.factId&&message.body.toLowerCase().includes(f.value.toLowerCase())))));
    const discovery=message.dependencyDiscovery==="explicit"?"explicit":"inferred";
    if(!corrections.length) {impacts.push({messageId:message.id,affected:false,discovery,rewriteEligible:false,reason:"No dependency on the disputed facts was found."});continue;}
    const correction=corrections[0];
    const eligible=corrections.length===1&&correction.category==="technology"&&correction.scope==="company"&&correction.relation==="contradicted"&&correction.replacementValue==="HubSpot"&&hubspotSupported;
    impacts.push({messageId:message.id,affected:true,discovery,rewriteEligible:eligible,reason:eligible?"The CRM claim is contradicted. The seller supports HubSpot; a revised suggestion is available.":"This follow-up repeats an affected assumption. Pause and reassess relevance before continuing."});
    actions.push({id:`pause-${message.id}`,type:"pause",messageId:message.id,expectedVersion:message.version,reason:"Pause a pending follow-up that relies on disputed information."});
    if(eligible) actions.push({id:`rewrite-${message.id}`,type:"rewrite",messageId:message.id,factId:correction.factId,expectedVersion:message.version,dependsOn:`update-${correction.factId}`,newBody:"Thanks for correcting us, Maya. Since your team now uses HubSpot, Routewise can check your HubSpot lead-routing rules. If routing is still a priority, would a short overview be useful?",reason:"Suggested draft based on the seller’s supported integration; remains paused for review."});
  }
  if(assessment.outcome==="ambiguous"&&!actions.length) actions.push({id:"review-ambiguous",type:"human_review",reason:"The reply is unclear or contains untrusted instructions. No record change is proposed."});
  return {actions,impacts};
}
export function evaluatePractice(context:Context,reply:string,hubspotSupported:boolean): Pick<Review,"inputFingerprint"|"reply"|"hubspotSupported"|"scenarioId"|"assessment"|"actions"|"impacts"|"state"> {
  if(!reply.trim()||reply.length>12000) throw new Error("Enter a reply between 1 and 12,000 characters");
  const assessment=assessPractice(context,reply), proposed=propose(context,assessment,hubspotSupported);
  return {inputFingerprint:fingerprint(context,reply,hubspotSupported),reply,hubspotSupported,scenarioId:context.scenarioId,assessment,...proposed,state:"needs_review"};
}
