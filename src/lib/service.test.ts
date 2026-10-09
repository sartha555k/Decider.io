import { describe, it, expect } from "vitest";
import { openDatabase, listEntities } from "./database";
import {
  evaluate,
  approve,
  reject,
  revert,
  ConflictError,
  type ApprovalInput,
} from "./service";
import { readContext, scenarios, seedScenario } from "./scenarios";
import type { Review } from "./domain";
const reply = scenarios[0].reply;
function input(
  review: Review,
  actionIds = review.actions.map((a) => a.id),
): ApprovalInput {
  return {
    reviewId: review.id,
    scenarioId: "crm",
    reply,
    hubspotSupported: true,
    actionIds,
  };
}
describe("approval and audit workflow", () => {
  it("approves selected actions, preserves original evidence, and is idempotent", async () => {
    const db = openDatabase(":memory:");
    try {
      const review = await evaluate(db, "crm", reply, true);
      const result = approve(db, input(review));
      expect(result.state).toBe("approved");
      approve(db, input(review));
      const ctx = readContext(db, "crm");
      expect(ctx.facts).toHaveLength(2);
      expect(ctx.facts.find((f) => f.id === "crm-fact-0")?.status).toBe(
        "superseded",
      );
      expect(ctx.evidence[0].originalText).toContain("Salesforce");
      expect(ctx.outreach.find((m) => m.id === "crm-sent")?.status).toBe(
        "sent",
      );
      expect(ctx.outreach.find((m) => m.id === "crm-general")?.status).toBe(
        "queued",
      );
      expect(
        ctx.outreach.find((m) => m.id === "crm-dependent-0")?.body,
      ).toContain("HubSpot");
      expect(
        listEntities(db, "audit", ctx.seller.id, ctx.company.id),
      ).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it("allows approving a fact while declining the rewrite", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", reply, true);
      approve(
        db,
        input(
          r,
          r.actions.filter((a) => a.type === "update_fact").map((a) => a.id),
        ),
      );
      expect(readContext(db, "crm").outreach[0].body).toContain("Salesforce");
    } finally {
      db.close();
    }
  });
  it("rejects changed inputs and newer fact versions atomically", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", reply, true);
      expect(() => approve(db, { ...input(r), reply: "edited" })).toThrow(
        ConflictError,
      );
      const ctx = readContext(db, "crm");
      const fact = { ...ctx.facts[0], version: 2 };
      db.prepare("UPDATE facts SET data=? WHERE id=?").run(
        JSON.stringify(fact),
        fact.id,
      );
      expect(() => approve(db, input(r))).toThrow(ConflictError);
      expect(readContext(db, "crm").facts).toHaveLength(1);
    } finally {
      db.close();
    }
  });
  it("rejects approval if a queued message has since been sent", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", reply, true);
      const m = {
        ...readContext(db, "crm").outreach[0],
        status: "sent",
        version: 2,
      };
      db.prepare("UPDATE outreach SET data=? WHERE id=?").run(
        JSON.stringify(m),
        m.id,
      );
      expect(() => approve(db, input(r))).toThrow(ConflictError);
    } finally {
      db.close();
    }
  });
  it("keeps team-scoped additions separate from company facts", async () => {
    const db = openDatabase(":memory:");
    try {
      const text = scenarios.find((s) => s.id === "team")!.reply,
        r = await evaluate(db, "team", text, true);
      approve(db, { ...input(r), scenarioId: "team", reply: text });
      const facts = readContext(db, "team").facts;
      expect(facts[0].status).toBe("active");
      expect(facts[1].scope).toBe("team");
    } finally {
      db.close();
    }
  });
  it("deduplicates identical replies and evaluations", async () => {
    const db = openDatabase(":memory:");
    try {
      const first = await evaluate(db, "crm", reply, true),
        second = await evaluate(db, "crm", reply, true);
      expect(second.id).toBe(first.id);
      expect(readContext(db, "crm").messages).toHaveLength(3);
    } finally {
      db.close();
    }
  });
  it("records rejection without mutating research", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", reply, true);
      reject(db, "crm", r.id);
      expect(readContext(db, "crm").facts).toHaveLength(1);
      expect(() => approve(db, input(r))).toThrow();
    } finally {
      db.close();
    }
  });
  it("cannot approve another workspace’s review", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", reply, true);
      seedScenario(db, "team");
      expect(() => approve(db, { ...input(r), scenarioId: "team" })).toThrow(
        ConflictError,
      );
    } finally {
      db.close();
    }
  });
  it("reverts an internal repair through a new idempotent audit event", async () => {
    const db = openDatabase(":memory:");
    try {
      const r = await evaluate(db, "crm", reply, true);
      approve(db, input(r));
      const ctx = readContext(db, "crm"),
        event = listEntities(db, "audit", ctx.seller.id, ctx.company.id)[0];
      const reversal = revert(db, "crm", event.id);
      expect(revert(db, "crm", event.id).id).toBe(reversal.id);
      expect(readContext(db, "crm").facts).toHaveLength(1);
      expect(readContext(db, "crm").facts[0].status).toBe("active");
      expect(readContext(db, "crm").outreach[0].status).toBe("queued");
    } finally {
      db.close();
    }
  });
  it("records opt-out immediately and preserves sent mail", async () => {
    const db = openDatabase(":memory:");
    try {
      const text = scenarios.find((s) => s.id === "opt-out")!.reply;
      await evaluate(db, "opt-out", text, true);
      const ctx = readContext(db, "opt-out");
      expect(ctx.contact.suppressed).toBe(true);
      expect(ctx.outreach.filter((m) => m.status === "cancelled")).toHaveLength(
        2,
      );
      expect(ctx.outreach.find((m) => m.status === "sent")).toBeDefined();
      expect(() =>
        revert(
          db,
          "opt-out",
          listEntities(db, "audit", ctx.seller.id, ctx.company.id)[0].id,
        ),
      ).toThrow();
    } finally {
      db.close();
    }
  });
  it("refuses unconfigured live evaluation instead of simulating", async () => {
    const db = openDatabase(":memory:");
    try {
      await expect(evaluate(db, "crm", reply, true, "live")).rejects.toThrow(
        "not configured",
      );
      expect(listEntities(db, "reviews", "seller-crm", "company-crm")).toEqual(
        [],
      );
    } finally {
      db.close();
    }
  });
});
