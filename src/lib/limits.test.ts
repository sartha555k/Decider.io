import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./database";
import { priceConfiguration, reserveLiveEvaluation } from "./limits";
const keys = [
  "TRACKER_GENERATION_MODEL",
  "TRACKER_DECISION_INPUT_USD_PER_MILLION",
  "TRACKER_MONTHLY_BUDGET_USD",
  "TRACKER_GENERATION_INPUT_USD_PER_MILLION",
  "TRACKER_GENERATION_OUTPUT_USD_PER_MILLION",
  "TRACKER_DAILY_BUDGET_USD",
  "TRACKER_DAILY_LIVE_EVALUATIONS",
];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
beforeEach(() => {
  for (const key of keys) delete process.env[key];
});
afterEach(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
describe("live spending guard", () => {
  it("requires generation pricing before any reservation", () => {
    process.env.TRACKER_GENERATION_MODEL = "other-model";
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
  it("uses cheap reviewed pricing and conservative defaults for GPT-5 nano", () => {
    expect(priceConfiguration()).toMatchObject({
      generationInput: 0.05,
      generationOutput: 0.4,
      dailyBudget: 0.05,
      monthlyBudget: 1,
      dailyEvaluations: 2,
    });
    const db = openDatabase(":memory:");
    try {
      reserveLiveEvaluation(db);
      reserveLiveEvaluation(db);
      expect(() => reserveLiveEvaluation(db)).toThrow("daily");
    } finally {
      db.close();
    }
  });
  it("zero monthly budget blocks the first evaluation", () => {
    process.env.TRACKER_MONTHLY_BUDGET_USD = "0";
    const db = openDatabase(":memory:");
    try {
      expect(() => reserveLiveEvaluation(db)).toThrow("monthly");
    } finally {
      db.close();
    }
  });
  it("counts reservations across the current month but excludes prior months", () => {
    process.env.TRACKER_DAILY_BUDGET_USD = "10";
    process.env.TRACKER_DAILY_LIVE_EVALUATIONS = "100";
    process.env.TRACKER_MONTHLY_BUDGET_USD = "0.03";
    const db = openDatabase(":memory:");
    try {
      db.exec(
        "CREATE TABLE live_reservations(id INTEGER PRIMARY KEY, day TEXT NOT NULL, reserved_usd REAL NOT NULL)",
      );
      const now = new Date();
      const prior = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      )
        .toISOString()
        .slice(0, 10);
      db.prepare(
        "INSERT INTO live_reservations(day,reserved_usd) VALUES(?,?)",
      ).run(prior, 100);
      reserveLiveEvaluation(db);
      // Move this reservation to the first of the current month to exercise the month query.
      db.prepare("UPDATE live_reservations SET day=? WHERE day<>?").run(
        now.toISOString().slice(0, 7) + "-01",
        prior,
      );
      expect(() => reserveLiveEvaluation(db)).toThrow("monthly");
      expect(
        db.prepare("SELECT COUNT(*) AS n FROM live_reservations").get()?.n,
      ).toBe(2);
    } finally {
      db.close();
    }
  });
});
