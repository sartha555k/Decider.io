import { describe, it, expect, vi } from "vitest";
import type { DecisionCreateParams } from "openai/resources/decisions";
import { openDatabase } from "./database";
import { seedScenario, readContext, scenarios } from "./scenarios";
import { evaluate, approve } from "./service";
import {
  evaluateLive,
  parseAnswers,
  createTransport,
  type Transport,
  DECISION_MODEL,
} from "./openai";
function ctx() {
  const db = openDatabase(":memory:");
  try {
    seedScenario(db, "crm");
    return readContext(db, "crm");
  } finally {
    db.close();
  }
}
function answer(
  request: DecisionCreateParams,
  overrides: Record<string, string | boolean> = {},
  confidence = 0.9,
) {
  return {
    model: DECISION_MODEL,
    usage: { input_tokens: 120 },
    answers: request.questions.map((q) => {
      if (q.type !== "choice") throw new Error("Unexpected question");
      const value =
        overrides[q.name!] ??
        (q.name === "opt_out"
          ? false
          : q.name?.startsWith("relation")
            ? "contradicted"
            : q.name?.startsWith("scope")
              ? "company"
              : q.name?.startsWith("evidence")
                ? "statement-0"
                : true);
      return {
        name: q.name,
        type: "choice",
        choice: value,
        confidence,
        probabilities: q.choices.map((c) => ({
          value: c.value,
          probability: c.value === value ? 1 : 0,
        })),
      };
    }),
  };
}
function transport(
  overrides: Record<string, string | boolean> = {},
  confidence = 0.9,
): Transport {
  return { decide: vi.fn(async (r) => answer(r, overrides, confidence)) };
}
describe("Decisions-only protocol with mocked transport", () => {
  it("selects exact buyer evidence and evaluates impacts using only the supported model", async () => {
    const client = transport();
    const result = await evaluateLive(ctx(), scenarios[0].reply, true, client);
    expect(result.failure).toBeUndefined();
    expect(result.corrections[0].replacementValue).toBe(
      "We switched to HubSpot last month.",
    );
    expect(result.corrections[0].quote).toBe(
      "We switched to HubSpot last month.",
    );
    expect(result.draftSuggestions).toEqual({});
    expect(client.decide).toHaveBeenCalledTimes(2);
    for (const [request] of vi.mocked(client.decide).mock.calls)
      expect(request.model).toBe("gpt-6-luna");
    expect(result.usage).toEqual({
      decisionInputTokens: 240,
      generationInputTokens: 0,
      generationOutputTokens: 0,
    });
  });
  it("exposes only the Decisions operation from the SDK transport", () => {
    const previous = process.env.TRACKER_OPENAI_KEY;
    process.env.TRACKER_OPENAI_KEY = "fake-unit-test-credential";
    try {
      expect(Object.keys(createTransport())).toEqual(["decide"]);
    } finally {
      if (previous === undefined) delete process.env.TRACKER_OPENAI_KEY;
      else process.env.TRACKER_OPENAI_KEY = previous;
    }
  });
  it("routes refusal to review without repair", async () => {
    const client: Transport = {
      decide: async (r) => ({
        model: DECISION_MODEL,
        usage: { input_tokens: 10 },
        answers: r.questions.map((q) => ({ name: q.name, type: "refusal" })),
      }),
    };
    const result = await evaluateLive(ctx(), scenarios[0].reply, true, client);
    expect(result.failure).toBeDefined();
    expect(result.corrections).toEqual([]);
  });
  it("rejects invented statement IDs rather than accepting fabricated evidence", async () => {
    const result = await evaluateLive(
      ctx(),
      scenarios[0].reply,
      true,
      transport({ "evidence:crm-fact-0": "invented-statement" }),
    );
    expect(result.failure).toBeDefined();
    expect(result.corrections).toEqual([]);
  });
  it.each([
    [{ "evidence:crm-fact-0": "none" }, 0.9],
    [{ "scope:crm-fact-0": "unknown" }, 0.9],
    [{}, 0.5],
  ])(
    "does not propose a replacement without clear evidence and scope",
    async (overrides, confidence) => {
      const result = await evaluateLive(
        ctx(),
        scenarios[0].reply,
        true,
        transport(overrides as Record<string, string>, confidence),
      );
      expect(result.failure).toBeUndefined();
      expect(result.outcome).toBe("ambiguous");
      expect(result.corrections[0].replacementValue).toBeNull();
    },
  );
  it("keeps long buyer statements intact and routes them to manual research", async () => {
    const reply = "We switched to HubSpot " + "x".repeat(510);
    const result = await evaluateLive(ctx(), reply, true, transport());
    expect(result.corrections[0].quote).toBe(reply);
    expect(result.corrections[0].replacementValue).toBeNull();
  });
  it("returns after one call for an opt-out or an unrelated reply", async () => {
    const cases: Record<string, string | boolean>[] = [
      { opt_out: true },
      { "relation:crm-fact-0": "unrelated" },
    ];
    for (const overrides of cases) {
      const client = transport(overrides);
      const result = await evaluateLive(
        ctx(),
        scenarios[0].reply,
        true,
        client,
      );
      expect(result.failure).toBeUndefined();
      expect(client.decide).toHaveBeenCalledTimes(1);
      expect(result.corrections).toEqual([]);
    }
  });
  it("applies quote-based facts and pauses affected outreach without generating a draft", async () => {
    const db = openDatabase(":memory:");
    try {
      const reply = scenarios[0].reply;
      const review = await evaluate(
        db,
        "crm",
        reply,
        true,
        "live",
        (context, text, support) =>
          evaluateLive(context, text, support, transport()),
        "decisions-only-test",
      );
      expect(review.actions.map((a) => a.type)).toEqual([
        "update_fact",
        "pause",
      ]);
      approve(db, {
        reviewId: review.id,
        scenarioId: "crm",
        reply,
        hubspotSupported: true,
        actionIds: review.actions.map((a) => a.id),
      });
      const context = readContext(db, "crm");
      expect(context.facts.find((f) => f.status === "active")?.value).toBe(
        "We switched to HubSpot last month.",
      );
      const message = context.outreach.find((m) => m.id === "crm-dependent-0")!;
      expect(message.status).toBe("paused");
      expect(message.body).toContain("Salesforce");
      expect(context.outreach.find((m) => m.id === "crm-sent")?.status).toBe(
        "sent",
      );
    } finally {
      db.close();
    }
  });
  it("compares against the already approved HubSpot fact and reuses a saved no-change result", async () => {
    const db = openDatabase(":memory:");
    try {
      const reply = scenarios[0].reply;
      const original = await evaluate(db, "crm", reply, true);
      approve(db, {
        reviewId: original.id,
        scenarioId: "crm",
        reply,
        hubspotSupported: true,
        actionIds: original.actions.map((a) => a.id),
      });
      const client: Transport = {
        decide: vi.fn(async (request: DecisionCreateParams) =>
          answer(
            request,
            Object.fromEntries(
              request.questions.flatMap((q) =>
                q.name?.startsWith("relation:")
                  ? [[q.name, "supported"]]
                  : q.name?.startsWith("evidence:")
                    ? [[q.name, "none"]]
                    : [],
              ),
            ),
          ),
        ),
      };
      const evaluator = (
        context: ReturnType<typeof ctx>,
        text: string,
        support: boolean,
      ) => evaluateLive(context, text, support, client);
      const review = await evaluate(
        db,
        "crm",
        reply,
        true,
        "live",
        evaluator,
        "confirmed-current-fact",
      );
      expect(review.assessment.outcome).toBe("no_correction");
      expect(review.comparedFacts?.map((f) => f.value)).toEqual(["HubSpot"]);
      expect(review.actions).toEqual([]);
      expect(review.cacheHit).toBe(false);
      const cached = await evaluate(
        db,
        "crm",
        reply,
        true,
        "live",
        evaluator,
        "confirmed-current-fact",
      );
      expect(cached.id).toBe(review.id);
      expect(cached.cacheHit).toBe(true);
      expect(client.decide).toHaveBeenCalledTimes(1);
      // The snapshot remains the fact used for the judgment, not the older Salesforce source.
      expect(cached.comparedFacts?.[0].value).toBe("HubSpot");
    } finally {
      db.close();
    }
  });
  it.each(["supported", "unrelated"])(
    "routes low-confidence %s judgments to review instead of declaring no correction",
    async (relation) => {
      const result = await evaluateLive(
        ctx(),
        scenarios[0].reply,
        true,
        transport({ "relation:crm-fact-0": relation }, 0.5),
      );
      expect(result.outcome).toBe("ambiguous");
      expect(result.corrections[0].replacementValue).toBeNull();
      expect(result.corrections[0].relation).toBe("unclear");
    },
  );
  it("never leaks upstream error text or uses practice fallback", async () => {
    const result = await evaluateLive(ctx(), scenarios[0].reply, true, {
      decide: async () => {
        throw new Error("secret-key-do-not-leak");
      },
    });
    expect(result.mode).toBe("live");
    expect(JSON.stringify(result)).not.toContain("secret-key-do-not-leak");
    expect(result.failure).toBeDefined();
  });
  it("rejects missing answers and unsupported models", () => {
    const questions: DecisionCreateParams.QuestionParamChoice[] = [
      {
        name: "test",
        type: "choice",
        instructions: "test",
        choices: [{ value: true }, { value: false }],
      },
    ];
    expect(() =>
      parseAnswers(
        { model: DECISION_MODEL, answers: [], usage: { input_tokens: 10 } },
        questions,
      ),
    ).toThrow();
    expect(() =>
      parseAnswers(
        { model: "gpt-5-nano", answers: [], usage: { input_tokens: 10 } },
        questions,
      ),
    ).toThrow("model");
  });
});
