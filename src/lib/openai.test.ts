import { describe, it, expect, vi } from "vitest";
import type { DecisionCreateParams } from "openai/resources/decisions";
import { openDatabase } from "./database";
import { seedScenario, readContext, scenarios } from "./scenarios";
import {
  evaluateLive,
  parseAnswers,
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
function answer(request: DecisionCreateParams) {
  return {
    model: DECISION_MODEL,
    usage: { input_tokens: 120 },
    answers: request.questions.map((q) => {
      if (q.type !== "choice") throw new Error("Unexpected question");
      const value =
        q.name === "opt_out"
          ? false
          : q.name?.startsWith("relation")
            ? "contradicted"
            : q.name?.startsWith("scope")
              ? "company"
              : true;
      return {
        name: q.name,
        type: "choice",
        choice: value,
        confidence: 0.9,
        probabilities: q.choices.map((c) => ({
          value: c.value,
          probability: c.value === value ? 1 : 0,
        })),
      };
    }),
  };
}
describe("actual Decisions protocol with mocked transport", () => {
  it("uses sequential decision stages and separate Structured Outputs extraction", async () => {
    const transport: Transport = {
      decide: vi.fn(async (r) => answer(r)),
      generate: vi.fn(async () => ({
        status: "completed",
        usage: { input_tokens: 90, output_tokens: 20 },
        output_text: JSON.stringify({
          corrections: [
            {
              factId: "crm-fact-0",
              replacementValue: "HubSpot",
              quote: scenarios[0].reply,
              summary: "Buyer reports switching to HubSpot.",
            },
          ],
        }),
      })),
    };
    const result = await evaluateLive(
      ctx(),
      scenarios[0].reply,
      true,
      transport,
    );
    expect(result.failure).toBeUndefined();
    expect(result.mode).toBe("live");
    expect(result.corrections[0].replacementValue).toBe("HubSpot");
    expect(transport.decide).toHaveBeenCalledTimes(2);
    expect(transport.generate).toHaveBeenCalledTimes(1);
    expect(transport.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5-nano",
        reasoning: { effort: "minimal" },
        store: false,
      }),
    );
    expect(result.usage?.decisionInputTokens).toBe(240);
    expect(result.usage?.generationInputTokens).toBe(90);
    expect(result.usage?.generationOutputTokens).toBe(20);
  });
  it("routes refusal to review without repair", async () => {
    const transport: Transport = {
      decide: async (r) => ({
        model: DECISION_MODEL,
        usage: { input_tokens: 10 },
        answers: r.questions.map((q) => ({ type: "refusal", name: q.name })),
      }),
      generate: vi.fn(),
    };
    const result = await evaluateLive(
      ctx(),
      scenarios[0].reply,
      true,
      transport,
    );
    expect(result.failure).toBeDefined();
    expect(result.corrections).toEqual([]);
    expect(transport.generate).not.toHaveBeenCalled();
  });
  it("rejects invented supporting quotes", async () => {
    const transport: Transport = {
      decide: async (r) => answer(r),
      generate: async () => ({
        status: "completed",
        usage: { input_tokens: 10, output_tokens: 20 },
        output_text: JSON.stringify({
          corrections: [
            {
              factId: "crm-fact-0",
              replacementValue: "HubSpot",
              quote: "Invented buyer quote",
              summary: "Fake",
            },
          ],
        }),
      }),
    };
    expect(
      (await evaluateLive(ctx(), scenarios[0].reply, true, transport)).failure,
    ).toBeDefined();
  });
  it("never leaks upstream error text or uses a practice fallback", async () => {
    const result = await evaluateLive(ctx(), scenarios[0].reply, true, {
      decide: async () => {
        throw new Error("secret-key-do-not-leak");
      },
      generate: vi.fn(),
    });
    expect(result.mode).toBe("live");
    expect(JSON.stringify(result)).not.toContain("secret-key-do-not-leak");
    expect(result.failure).toBeDefined();
  });
  it("rejects malformed or missing answers", () => {
    expect(() =>
      parseAnswers(
        { model: DECISION_MODEL, answers: [], usage: { input_tokens: 10 } },
        [
          {
            name: "test",
            type: "choice",
            instructions: "test",
            choices: [{ value: true }, { value: false }],
          },
        ],
      ),
    ).toThrow();
  });
});
