import { describe, it, expect } from "vitest";
import { openDatabase } from "./database";
import { seedScenario, readContext, scenarios } from "./scenarios";
import { evaluatePractice, validateQuote, fingerprint } from "./engine";
import type { Context } from "./domain";
function context(id = "crm"): Context {
  const db = openDatabase(":memory:");
  try {
    seedScenario(db, id);
    return readContext(db, id);
  } finally {
    db.close();
  }
}
function evaluate(id = "crm", support = true) {
  return evaluatePractice(
    context(id),
    scenarios.find((s) => s.id === id)!.reply,
    support,
  );
}
describe("correction and dependency evaluation", () => {
  it("flags the CRM follow-up, leaves the general message alone, and never touches sent mail", () => {
    const result = evaluate();
    expect(result.assessment.corrections[0].replacementValue).toBe("HubSpot");
    expect(
      result.impacts.find((m) => m.messageId === "crm-dependent-0")?.affected,
    ).toBe(true);
    expect(
      result.impacts.find((m) => m.messageId === "crm-general")?.affected,
    ).toBe(false);
    expect(result.actions.some((a) => a.messageId === "crm-sent")).toBe(false);
  });
  it("only offers a rewrite when HubSpot is supported", () => {
    expect(
      evaluate("crm", true).actions.some((a) => a.type === "rewrite"),
    ).toBe(true);
    expect(
      evaluate("crm", false).actions.some((a) => a.type === "rewrite"),
    ).toBe(false);
  });
  it("keeps team corrections separate from company records", () => {
    const result = evaluate("team");
    expect(result.assessment.corrections[0].scope).toBe("team");
    expect(result.actions.find((a) => a.type === "update_fact")?.scope).toBe(
      "team",
    );
    expect(result.actions.some((a) => a.type === "rewrite")).toBe(false);
  });
  it("leaves tentative changes for further research", () => {
    const result = evaluate("tentative");
    expect(result.assessment.outcome).toBe("ambiguous");
    expect(result.actions.some((a) => a.type === "update_fact")).toBe(false);
  });
  it("separates multiple corrections", () => {
    expect(
      evaluate("multiple").assessment.corrections.map((c) => c.category),
    ).toEqual(["technology", "timing"]);
  });
  it("prioritizes opt-out and never proposes another pitch", () => {
    const result = evaluate("opt-out");
    expect(result.assessment.optOut).toBe(true);
    expect(result.actions).toEqual([]);
  });
  it("treats embedded commands as untrusted evidence", () => {
    const result = evaluate("malicious");
    expect(result.assessment.outcome).toBe("ambiguous");
    expect(result.actions.every((a) => a.type === "human_review")).toBe(true);
  });
  it("validates quote provenance", () => {
    expect(() => validateQuote("invented", "actual reply")).toThrow();
    expect(() => validateQuote("actual", "actual reply")).not.toThrow();
  });
  it("invalidates fingerprints when reply or seller support changes", () => {
    const ctx = context();
    expect(fingerprint(ctx, "old", true)).not.toBe(
      fingerprint(ctx, "new", true),
    );
    expect(fingerprint(ctx, "old", true)).not.toBe(
      fingerprint(ctx, "old", false),
    );
  });
  it.each(["expansion", "hiring", "solved", "wrong-person", "postponed"])(
    "evaluates the %s category fixture",
    (id) => {
      expect(evaluate(id).assessment.corrections).toHaveLength(1);
    },
  );
  it("labels imported message dependency discovery as inferred", () => {
    const ctx = context();
    ctx.outreach[0].factIds = [];
    ctx.outreach[0].claims = [];
    ctx.outreach[0].dependencyDiscovery = "unknown";
    expect(
      evaluatePractice(ctx, scenarios[0].reply, true).impacts[0].discovery,
    ).toBe("inferred");
  });
});
