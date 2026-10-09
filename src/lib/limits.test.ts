import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database";
import { reserveLiveEvaluation } from "./limits";
const keys = [
  "TRACKER_GENERATION_INPUT_USD_PER_MILLION",
  "TRACKER_GENERATION_OUTPUT_USD_PER_MILLION",
  "TRACKER_DAILY_BUDGET_USD",
  "TRACKER_DAILY_LIVE_EVALUATIONS",
];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
describe("live spending guard", () => {
  it("requires generation pricing before any reservation", () => {
    delete process.env.TRACKER_GENERATION_INPUT_USD_PER_MILLION;
    delete process.env.TRACKER_GENERATION_OUTPUT_USD_PER_MILLION;
    const db = openDatabase(":memory:");
    try {
      expect(() => reserveLiveEvaluation(db)).toThrow("pricing");
    } finally {
      db.close();
    }
  });
  it("enforces a persistent request quota", () => {
    process.env.TRACKER_GENERATION_INPUT_USD_PER_MILLION = "1";
    process.env.TRACKER_GENERATION_OUTPUT_USD_PER_MILLION = "1";
    process.env.TRACKER_DAILY_LIVE_EVALUATIONS = "1";
    process.env.TRACKER_DAILY_BUDGET_USD = "10";
    const db = openDatabase(":memory:");
    try {
      reserveLiveEvaluation(db);
      expect(() => reserveLiveEvaluation(db)).toThrow("limit");
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM live_reservations").get()?.n,
      ).toBe(1);
    } finally {
      db.close();
    }
  });
  it("rejects calls exceeding the conservative dollar budget", () => {
    process.env.TRACKER_GENERATION_INPUT_USD_PER_MILLION = "1";
    process.env.TRACKER_GENERATION_OUTPUT_USD_PER_MILLION = "1";
    process.env.TRACKER_DAILY_BUDGET_USD = "0";
    const db = openDatabase(":memory:");
    try {
      expect(() => reserveLiveEvaluation(db)).toThrow("limit");
    } finally {
      db.close();
    }
  });
});
