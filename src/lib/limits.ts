import type {DatabaseSync} from "node:sqlite";
import {transaction} from "./database";
function setting(name:string,fallback:number){const value=process.env[name];if(!value)return fallback;const parsed=Number(value);if(!Number.isFinite(parsed)||parsed<0)throw new Error("Invalid live spending configuration");return parsed;}
export function priceConfiguration(){return {decisionInput:setting("TRACKER_DECISION_INPUT_USD_PER_MILLION",.10),generationInput:process.env.TRACKER_GENERATION_INPUT_USD_PER_MILLION?setting("TRACKER_GENERATION_INPUT_USD_PER_MILLION",0):null,generationOutput:process.env.TRACKER_GENERATION_OUTPUT_USD_PER_MILLION?setting("TRACKER_GENERATION_OUTPUT_USD_PER_MILLION",0):null,dailyBudget:setting("TRACKER_DAILY_BUDGET_USD",1),dailyEvaluations:Math.min(100,Math.floor(setting("TRACKER_DAILY_LIVE_EVALUATIONS",20)))};}
export function reserveLiveEvaluation(db:DatabaseSync){
 const config=priceConfiguration();
 if(config.generationInput===null||config.generationOutput===null)throw new Error("Configure reviewed Responses input/output pricing before enabling live evaluations, so the spending guard can reserve a bounded cost.");
 // Conservative byte-based input bound for at most two calls to each service.
 const reserve=(128000*config.decisionInput+128000*config.generationInput+3600*config.generationOutput)/1000000;
 db.exec("CREATE TABLE IF NOT EXISTS live_reservations(id INTEGER PRIMARY KEY, day TEXT NOT NULL, reserved_usd REAL NOT NULL)");
 transaction(db,()=>{
  const day=new Date().toISOString().slice(0,10);
  const totals=db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(reserved_usd),0) AS cost FROM live_reservations WHERE day=?").get(day)!;
  if(Number(totals.count)>=config.dailyEvaluations||Number(totals.cost)+reserve>config.dailyBudget)throw new Error("The configured daily live evaluation or spending limit has been reached. No API call was made.");
  db.prepare("INSERT INTO live_reservations(day,reserved_usd) VALUES(?,?)").run(day,reserve);
 });
}
