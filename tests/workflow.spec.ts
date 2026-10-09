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
