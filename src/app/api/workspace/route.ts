import {NextResponse} from "next/server";
import {openDatabase,listEntities} from "../../../lib/database";
import {scenarios,getScenario,seedScenario,readContext} from "../../../lib/scenarios";
import {evaluate,approve,reject,revert,recordFeedback,ConflictError} from "../../../lib/service";
import {connectionStatus,createTransport,evaluateLive,integrationRevision} from "../../../lib/openai";
import {reserveLiveEvaluation,priceConfiguration} from "../../../lib/limits";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function response(db:ReturnType<typeof openDatabase>,id:string){
 const context=readContext(db,id);
 return {context,scenarios,scenario:getScenario(id),reviews:listEntities(db,"reviews",context.seller.id,context.company.id),audit:listEntities(db,"audit",context.seller.id,context.company.id),connection:connectionStatus(),pricing:priceConfiguration()};
}
export async function GET(request:Request){
 const db=openDatabase();try{const id=new URL(request.url).searchParams.get("scenario")||"crm";getScenario(id);seedScenario(db,id);return NextResponse.json(response(db,id),{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({error:"The selected fictional workspace could not be loaded."},{status:400});}finally{db.close();}
}
export async function POST(request:Request){
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({error:"Cross-origin mutations are not allowed."},{status:403});
 const raw=await request.text();if(raw.length>64000)return NextResponse.json({error:"Request is too large."},{status:413});
 let input;try{input=JSON.parse(raw) as Record<string,unknown>;}catch{return NextResponse.json({error:"Request must contain valid JSON."},{status:400});}
 if(!input||typeof input!=="object"||typeof input.scenarioId!=="string")return NextResponse.json({error:"Choose a fictional scenario."},{status:400});
 const db=openDatabase();
 try {
  getScenario(input.scenarioId);seedScenario(db,input.scenarioId);
  let review;
  if(input.operation==="evaluate"){
   if(typeof input.reply!=="string"||typeof input.hubspotSupported!=="boolean"||!['practice','live'].includes(String(input.mode)))throw new Error("Invalid evaluation inputs");
   if(input.mode==="live"){
    const transport=createTransport();
    review=await evaluate(db,input.scenarioId,input.reply,input.hubspotSupported,"live",(ctx,reply,support)=>{reserveLiveEvaluation(db);return evaluateLive(ctx,reply,support,transport,{generateDrafts:input.generateDrafts===true});},integrationRevision+String(input.generateDrafts)+String(process.env.TRACKER_GENERATION_MODEL||"gpt-6-luna"));
   }else review=await evaluate(db,input.scenarioId,input.reply,input.hubspotSupported);
  }else if(input.operation==="approve"){
   if(typeof input.reviewId!=="string"||typeof input.reply!=="string"||typeof input.hubspotSupported!=="boolean"||!Array.isArray(input.actionIds)||!input.actionIds.every(v=>typeof v==="string"))throw new Error("Invalid approval inputs");
   const edits=input.edits;
   if(edits!==undefined&&(!edits||typeof edits!=="object"||Array.isArray(edits)||Object.values(edits).some(v=>typeof v!=="string")))throw new Error("Invalid operator edits");
   review=approve(db,{reviewId:input.reviewId,scenarioId:input.scenarioId,reply:input.reply,hubspotSupported:input.hubspotSupported,actionIds:input.actionIds as string[],edits:edits as Record<string,string>|undefined});
  }else if(input.operation==="reject"){
   if(typeof input.reviewId!=="string")throw new Error("Choose a review");review=reject(db,input.scenarioId,input.reviewId);
  }else if(input.operation==="revert"){
   if(typeof input.eventId!=="string")throw new Error("Choose an audit event");revert(db,input.scenarioId,input.eventId);
  }else if(input.operation==="feedback"){
   if(typeof input.reviewId!=="string"||!['missed_correction','incorrectly_flagged'].includes(String(input.kind)))throw new Error("Choose valid feedback");recordFeedback(db,input.scenarioId,input.reviewId,input.kind as "missed_correction"|"incorrectly_flagged");
  }else throw new Error("Unknown workspace action");
  return NextResponse.json({...response(db,input.scenarioId),review},{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  const message=error instanceof Error?error.message:"Unable to complete this local action";
  // Application errors have static messages; SQL/internal exceptions are not exposed.
  const safe=/sqlite|SQLITE|constraint|syntax|ENOENT|database/i.test(message)?"The local action could not be completed. No partial repair was applied.":message;
  return NextResponse.json({error:safe},{status:error instanceof ConflictError?409:400});
 }finally{db.close();}
}
