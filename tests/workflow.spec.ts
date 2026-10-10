import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
async function load(page: import("@playwright/test").Page, scenario = "crm") {
  await page.goto("/");
  await expect(page.getByLabel("Explore a fictional scenario")).toBeEnabled();
  if (scenario !== "crm")
    await page
      .getByLabel("Explore a fictional scenario")
      .selectOption(scenario);
  await expect(
    page.getByRole("button", { name: "Evaluate reply" }),
  ).toBeVisible();
  await expect(
    page.getByText("Loading fictional records and history…"),
  ).toHaveCount(0);
}
async function evaluate(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Evaluate reply" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose the changes to apply" }),
  ).toBeVisible();
}
test("complete CRM repair preserves history and supports audited reversal", async ({
  page,
}, info) => {
  await load(page);
  await evaluate(page);
  await expect(
    page.getByText(
      "1 proposed correction · 1 pending follow-up need attention",
    ),
  ).toBeVisible();
  await expect(page.getByText("Contradicted", { exact: true })).toBeVisible();
  if (info.project.name === "desktop") {
    mkdirSync("docs/images", { recursive: true });
    await page.screenshot({
      path: "docs/images/review-desktop.png",
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Approve selected (3)" }).click();
  await expect(
    page.getByText("Selected changes saved locally.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("CRM: HubSpot", { exact: true })).toBeVisible();
  await expect(page.getByText("superseded", { exact: true })).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Revert this internal repair" })
    .click();
  await expect(
    page.getByText("Internal repair reverted through a new audited action.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText("CRM: HubSpot", { exact: true })).toHaveCount(0);
});
test("edited inputs invalidate approval and unsupported HubSpot prevents rewriting", async ({
  page,
}) => {
  await load(page);
  await evaluate(page);
  await page.getByLabel("HubSpot supported").uncheck();
  await expect(
    page.getByRole("button", { name: /Approve selected/ }),
  ).toBeDisabled();
  await expect(
    page.getByText("Your inputs changed.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Evaluate reply" }).click();
  await expect(
    page.getByRole("button", { name: "Approve selected (2)" }),
  ).toBeEnabled();
  await expect(
    page.getByText("Save revised draft", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Prospect reply").fill("We might switch CRMs.");
  await expect(
    page.getByRole("button", { name: /Approve selected/ }),
  ).toBeDisabled();
});
test("team correction stays scoped and multiple changes remain separate", async ({
  page,
}) => {
  await load(page, "team");
  await evaluate(page);
  await expect(page.locator(".correction-card")).toHaveCount(1);
  await expect(
    page.locator(".correction-card").getByText("team scope", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Save revised draft", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Explore a fictional scenario")
    .selectOption("multiple");
  await evaluate(page);
  await expect(page.locator(".correction-card")).toHaveCount(2);
});
test("opt-out immediately cancels pending local outreach", async ({ page }) => {
  await load(page, "opt-out");
  await page.getByRole("button", { name: "Evaluate reply" }).click();
  await expect(
    page.getByRole("heading", { name: "Contact stopped", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Contact suppressed", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toHaveCount(2);
  await expect(page.getByText("Sent · History", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Save revised draft", { exact: true }),
  ).toHaveCount(0);
});
test("live mode makes no call on selection and reports missing configuration", async ({
  page,
}) => {
  await load(page);
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") posts++;
  });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(
    page.getByText("Live mode not configured", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(0);
  await expect(
    page.getByText("Decisions only · GPT-6 Luna.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Generate optional draft suggestions", { exact: false }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Evaluate reply" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Live mode is not configured",
  );
  await expect(page.locator(".correction-card")).toHaveCount(0);
});
test("keyboard access, contrast, and responsive layout", async ({
  page,
}, info) => {
  await load(page);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to review workspace" }),
  ).toBeFocused();
  await evaluate(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  if (info.project.name === "mobile") {
    mkdirSync("docs/images", { recursive: true });
    await page.screenshot({
      path: "docs/images/review-mobile.png",
      fullPage: true,
    });
  }
});
test("server rejects cross-origin repair requests", async ({ request }) => {
  const response = await request.post("/api/workspace", {
    headers: { Origin: "https://untrusted.example" },
    data: {
      operation: "evaluate",
      scenarioId: "crm",
      reply: "Hello",
      hubspotSupported: true,
      mode: "practice",
    },
  });
  expect(response.status()).toBe(403);
});

test("partial approval keeps the old follow-up flagged on later evaluation", async ({
  page,
}) => {
  await load(page);
  await evaluate(page);
  await page.getByRole("checkbox", { name: /Save revised draft/ }).uncheck();
  await page.getByRole("checkbox", { name: /Pause this follow-up/ }).uncheck();
  await page.getByRole("button", { name: "Approve selected (1)" }).click();
  await expect(page.getByText("CRM: HubSpot", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Evaluate reply" }).click();
  await expect(
    page.getByRole("heading", { name: "No correction detected", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "This message still relies on research superseded by an earlier approved correction.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Save revised draft", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve selected (1)" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Revert this internal repair" })
    .click();
  await expect(page.getByText("CRM: HubSpot", { exact: true })).toHaveCount(0);
});

test("follow-ups and quality navigation work before evaluation and survive reload", async ({
  page,
}) => {
  await load(page);
  await page
    .getByRole("link", { name: "Local follow-ups", exact: true })
    .click();
  await expect(page).toHaveURL(/#followups$/);
  await expect(page.locator("#followups .followup-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Evaluate reply" }),
  ).toBeHidden();
  await expect(
    page.locator("#followups").getByText("Unaffected", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Local follow-ups", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(page.locator("#followups .followup-card")).toHaveCount(3);
  await page
    .getByRole("link", { name: "Data quality & usage", exact: true })
    .click();
  await expect(page.locator("#quality")).toBeVisible();
  await expect(page.locator("#followups")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Research quality", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("#quality")
      .getByText("No live token usage recorded.", { exact: false }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.goBack();
  await expect(page.locator("#followups")).toBeVisible();
  await page
    .getByRole("link", { name: "Review reply and choose repairs", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Evaluate reply" }),
  ).toBeVisible();
});

test("hiring repair updates saved follow-ups and quality feedback persists", async ({
  page,
}) => {
  await load(page, "hiring");
  await page
    .getByRole("link", { name: "Data quality & usage", exact: true })
    .click();
  // The scenario hasn't been evaluated yet on the first run; later runs retain its history.
  await expect(
    page.getByRole("heading", { name: "Research quality", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reply review", exact: true }).click();
  await evaluate(page);
  await page.getByRole("button", { name: "Approve selected (2)" }).click();
  await page
    .getByRole("link", { name: "Local follow-ups", exact: true })
    .click();
  await expect(
    page.locator("#followups").getByText("Paused", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#followups").getByText("Sent · History", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Data quality & usage", exact: true })
    .click();
  const metric = (label: string) =>
    page
      .locator("#quality .metrics > div")
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("strong");
  await expect(metric("Buyer-reported facts")).toHaveText("1");
  await expect(metric("Superseded facts preserved")).toHaveText("1");
  await expect(
    page.getByText(
      "0 pending follow-ups still reference superseded research.",
      { exact: true },
    ),
  ).toBeVisible();
  const misses = Number(await metric("Reported misses").innerText());
  const selectedReview = await page
    .getByLabel("Evaluation to assess")
    .inputValue();
  await page
    .getByRole("button", { name: "Report a missed correction", exact: true })
    .click();
  await expect(metric("Reported misses")).toHaveText(String(misses + 1));
  const saved = await page.request.get("/api/workspace?scenario=hiring");
  const body = await saved.json();
  expect(
    body.audit.some(
      (event: { action: string; reviewId: string }) =>
        event.action === "missed_correction" &&
        event.reviewId === selectedReview,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open selected evaluation", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Correction detected", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revert this internal repair" })
    .click();
  await page
    .getByRole("link", { name: "Local follow-ups", exact: true })
    .click();
  await expect(
    page.locator("#followups").getByText("Queued", { exact: true }),
  ).toHaveCount(2);
});

test("a Live confirmation explains current HubSpot research and cached evaluations", async ({
  page,
}) => {
  await load(page);
  const response = await page.request.get("/api/workspace?scenario=crm");
  const workspace = await response.json();
  // Return a controlled server result to verify the Live UI without any provider calls.
  const mockReview = {
    id: "mock-confirmed-review",
    reply: workspace.scenario.reply,
    hubspotSupported: true,
    scenarioId: "crm",
    state: "needs_review",
    actions: [],
    impacts: [],
    latencyMs: 10,
    comparedFacts: [
      {
        id: "mock-hubspot",
        field: "CRM",
        value: "HubSpot",
        scope: "company",
        version: 1,
      },
    ],
    cacheHit: true,
    assessment: {
      mode: "live",
      model: "gpt-6-luna",
      outcome: "no_correction",
      corrections: [],
      optOut: false,
      warnings: [],
      judgments: [],
      usage: { decisionInputTokens: 10, generationInputTokens: 0 },
    },
  };
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      json: { ...workspace, review: mockReview, reviews: [mockReview] },
    });
  });
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await page
    .getByRole("button", { name: "Evaluate reply", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "No new correction to saved research",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page
      .locator(".comparison-explanation")
      .getByText("CRM: HubSpot", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Saved evaluation reused", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Ready to acknowledge", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Inspect earlier repairs", exact: true })
    .click();
  await expect(page.locator("#history")).toBeVisible();
});

test("private deployment challenges unauthenticated page and API access while health stays public", async ({
  playwright,
  request,
}) => {
  const anonymous = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
    httpCredentials: undefined,
  });
  try {
    for (const path of ["/", "/api/workspace?scenario=crm", "/icon.svg"]) {
      const response = await anonymous.get(path);
      expect(response.status(), path).toBe(401);
      expect(response.headers()["www-authenticate"]).toContain("Basic");
    }
    const write = await anonymous.post("/api/workspace", {
      data: { operation: "evaluate", scenarioId: "crm", mode: "live" },
    });
    expect(write.status()).toBe(401);
    const health = await anonymous.get("/api/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });
    expect((await request.get("/api/workspace?scenario=crm")).status()).toBe(
      200,
    );
  } finally {
    await anonymous.dispose();
  }
});
