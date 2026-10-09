import { describe, expect, it } from "vitest";
import { openDatabase, listEntities } from "./database";
import { seedScenario, readContext, scenarios } from "./scenarios";
import { evaluatePractice } from "./engine";
import { evaluate, approve, revert, ConflictError } from "./service";
describe("repair relevance and reversal regressions", () => {
  it("does not offer a CRM pitch when the same reply says the need is solved", () => {
    const db = openDatabase(":memory:");
    try {
      seedScenario(db, "crm");
      const r = evaluatePractice(
        readContext(db, "crm"),
        "We switched to HubSpot. We already fixed our lead-routing issues and no longer need help.",
        true,
      );
      expect(r.actions.some((a) => a.type === "rewrite")).toBe(false);
    } finally {
      db.close();
    }
  });
  it("requires reevaluation when an operator changes the fact used by a rewrite", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", scenarios[0].reply, true),
        update = r.actions.find((a) => a.type === "update_fact")!;
      expect(() =>
        approve(db, {
          reviewId: r.id,
          scenarioId: "crm",
          reply: r.reply,
          hubspotSupported: true,
          actionIds: r.actions.map((a) => a.id),
          edits: { [update.id]: "Pipedrive" },
        }),
      ).toThrow("relevance");
      expect(readContext(db, "crm").facts).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it("rejects reversal after a record has changed", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", scenarios[0].reply, true);
      approve(db, {
        reviewId: r.id,
        scenarioId: "crm",
        reply: r.reply,
        hubspotSupported: true,
        actionIds: r.actions.map((a) => a.id),
      });
      const ctx = readContext(db, "crm"),
        message = { ...ctx.outreach[0], version: 20 };
      db.prepare("UPDATE outreach SET data=? WHERE id=?").run(
        JSON.stringify(message),
        message.id,
      );
      const event = listEntities(db, "audit", ctx.seller.id, ctx.company.id)[0];
      expect(() => revert(db, "crm", event.id)).toThrow(ConflictError);
      expect(readContext(db, "crm").facts).toHaveLength(2);
    } finally {
      db.close();
    }
  });
  it("can evaluate a new pending review after audited reversal", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", scenarios[0].reply, true);
      approve(db, {
        reviewId: r.id,
        scenarioId: "crm",
        reply: r.reply,
        hubspotSupported: true,
        actionIds: r.actions.map((a) => a.id),
      });
      const ctx = readContext(db, "crm"),
        event = listEntities(db, "audit", ctx.seller.id, ctx.company.id)[0];
      revert(db, "crm", event.id);
      const next = await evaluate(db, "crm", r.reply, true);
      expect(next.id).not.toBe(r.id);
      expect(next.state).toBe("needs_review");
    } finally {
      db.close();
    }
  });
  it("increments versions on reversal and retains buyer evidence", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", scenarios[0].reply, true);
      approve(db, {
        reviewId: r.id,
        scenarioId: "crm",
        reply: r.reply,
        hubspotSupported: true,
        actionIds: r.actions.map((a) => a.id),
      });
      const ctx = readContext(db, "crm"),
        event = listEntities(db, "audit", ctx.seller.id, ctx.company.id)[0];
      revert(db, "crm", event.id);
      const reverted = readContext(db, "crm");
      expect(reverted.facts[0].version).toBe(3);
      expect(reverted.outreach[0].version).toBe(4);
      expect(
        reverted.evidence.some(
          (e) => e.sourceType === "buyer_reply" && e.originalText === r.reply,
        ),
      ).toBe(true);
    } finally {
      db.close();
    }
  });
});
