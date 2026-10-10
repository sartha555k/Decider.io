import type { DatabaseSync } from "node:sqlite";
import { transaction } from "./database";
import {
  DEFAULT_GENERATION_MODEL,
  DEFAULT_GENERATION_INPUT_PRICE,
  DEFAULT_GENERATION_OUTPUT_PRICE,
} from "./api-policy";
function setting(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error("Invalid live spending configuration");
  return parsed;
}
export function priceConfiguration() {
  const usesDefaultModel =
    (process.env.TRACKER_GENERATION_MODEL || DEFAULT_GENERATION_MODEL) ===
    DEFAULT_GENERATION_MODEL;
  return {
    decisionInput: setting("TRACKER_DECISION_INPUT_USD_PER_MILLION", 0.1),
    generationInput: process.env.TRACKER_GENERATION_INPUT_USD_PER_MILLION
      ? setting("TRACKER_GENERATION_INPUT_USD_PER_MILLION", 0)
      : usesDefaultModel
        ? DEFAULT_GENERATION_INPUT_PRICE
        : null,
    generationOutput: process.env.TRACKER_GENERATION_OUTPUT_USD_PER_MILLION
      ? setting("TRACKER_GENERATION_OUTPUT_USD_PER_MILLION", 0)
      : usesDefaultModel
        ? DEFAULT_GENERATION_OUTPUT_PRICE
        : null,
    dailyBudget: setting("TRACKER_DAILY_BUDGET_USD", 0.05),
    monthlyBudget: setting("TRACKER_MONTHLY_BUDGET_USD", 1),
    dailyEvaluations: Math.min(
      100,
      Math.floor(setting("TRACKER_DAILY_LIVE_EVALUATIONS", 2)),
    ),
  };
}
export function reserveLiveEvaluation(db: DatabaseSync) {
  const config = priceConfiguration();
  if (config.generationInput === null || config.generationOutput === null)
    throw new Error(
      "Configure reviewed Responses input/output pricing before enabling live evaluations, so the spending guard can reserve a bounded cost.",
    );
  // Conservative byte-based input bound for at most two calls to each service.
  const reserve =
    (128000 * config.decisionInput +
      128000 * config.generationInput +
      3600 * config.generationOutput) /
    1000000;
  db.exec(
    "CREATE TABLE IF NOT EXISTS live_reservations(id INTEGER PRIMARY KEY, day TEXT NOT NULL, reserved_usd REAL NOT NULL)",
  );
  transaction(db, () => {
    const day = new Date().toISOString().slice(0, 10);
    const totals = db
      .prepare(
        "SELECT COUNT(*) AS count,COALESCE(SUM(reserved_usd),0) AS cost FROM live_reservations WHERE day=?",
      )
      .get(day)!;
    const monthly = db
      .prepare(
        "SELECT COALESCE(SUM(reserved_usd),0) AS cost FROM live_reservations WHERE substr(day,1,7)=?",
      )
      .get(day.slice(0, 7))!;
    if (Number(monthly.cost) + reserve > config.monthlyBudget)
      throw new Error(
        "The configured monthly live spending limit has been reached. No API call was made.",
      );
    if (
      Number(totals.count) >= config.dailyEvaluations ||
      Number(totals.cost) + reserve > config.dailyBudget
    )
      throw new Error(
        "The configured daily live evaluation or spending limit has been reached. No API call was made.",
      );
    db.prepare(
      "INSERT INTO live_reservations(day,reserved_usd) VALUES(?,?)",
    ).run(day, reserve);
  });
}
