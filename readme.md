# Buyer Correction Tracker

A working local demonstration of a proposed module for Rhycon. It connects a prospect’s corrections to specific research facts and future messages, proposes repairs, and preserves an understandable history. No Rhycon integration or endorsement is claimed.

## Run the application

Requires **Node.js 24**. The application uses Next.js, TypeScript, React, and persistent SQLite through Node’s built-in `node:sqlite`.

```sh
npm ci
npm run dev
```

The server runs on port 3000. In this cloud environment, use `npm ci --cache /workspace/.cache/npm` if the home cache is not writable. The existing checkout is already isolated; no additional worktree is needed.

For a production preview:

```sh
npm run build
npm start
```

The SQLite database is created automatically at `data/tracker.sqlite`. Set `TRACKER_DATABASE_PATH` to a persistent writable location to override it. Live processes must be restarted after environment restoration. Keep the database, WAL, and SHM files together when backing up a running database, or stop the app before copying the database file.

## Try the workflow

Select one of twelve clearly fictional scenarios. Edit the prospect reply and seller HubSpot capability, then click **Evaluate reply**. Practice evaluations are deterministic simulations without model probabilities. Results identify specific affected follow-ups; the general introduction remains unaffected, and already-sent email stays in history.

Approve actions individually, edit proposed values or suggested drafts, or reject the proposal. Research changes preserve old facts and original evidence. Revised drafts remain paused. Changing inputs disables approval until reevaluation. Server-side version checks prevent stale repairs, and repeated approvals are safe.

An explicit opt-out immediately suppresses the replying contact and cancels their pending local outreach. It never generates a new pitch. Approved internal repairs can be reverted through a new audited action only while their records remain unchanged. Reversal preserves buyer evidence and increments record versions. Future external integrations may have different reversal limits.

This is a **single-operator local demonstration**, not an authenticated multi-user SaaS deployment. All sample data is fictional. No real email sending, meeting booking, external CRM update, or invented Rhycon connector is included.

## OpenAI integration

Practice mode works without credentials. Live mode uses server-side OpenAI’s dedicated Decisions API (`gpt-6-luna`, SDK 7.32.0) for correction and impact judgments. Separate Responses API calls with strict Structured Outputs extract values/quotes/summaries and optionally propose drafts. Quotes must match source text. Raw upstream errors and credentials are not returned to the browser.

Configure a server-side credential securely and reviewed generation pricing using [.env.example](.env.example). Never place keys in browser-visible variables, Git, exported files, or chat. The status indicator reports credential presence, not verified model access. Mode selection makes no API call; explicit evaluation is required. Live mode never silently falls back to practice.

See [integration documentation](docs/openai-integration.md) for the verified official schema, model, SDK/image requirements, request limits, cost guard, and remaining live verification.

## Checks

```sh
npm test
npm run build
npm run typecheck
npm run format:check
npm run test:e2e
```

Browser tests run against the production build with an isolated temporary SQLite database and empty API credential bindings. Install Chromium with `npx playwright install --with-deps chromium` when no browser is available. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a system browser; this environment uses `/usr/bin/chromium`. The test server uses port 3100 and must be free.

Tests cover correction categories, scoped changes, seller relevance, message dependencies, preserved sent history, opt-out priority, malicious replies, ambiguity/refusal/failure, exact quotes, duplicate ingestion/evaluation/approval, stale versions, workspace isolation, selective approvals, reversal, spending limits, desktop/mobile interaction, keyboard access, automated WCAG contrast/accessibility checks, and cross-origin mutation rejection. OpenAI tests use mocked transport; no live calls have been verified.

CI runs these checks for PRs into `dev` and pushes to `dev`. Generated browser reports and local databases are ignored.

## Review the code

- `src/lib/scenarios.ts`: twelve fictional, independently scoped seller/prospect workspaces.
- `src/lib/engine.ts`: practice evaluation, explicit/inferred dependencies, and application routing rules.
- `src/lib/service.ts`: ingestion, persistent reviews, scoped approvals, audit events, and reversal.
- `src/lib/openai.ts`: the documented Decisions protocol and separate Structured Outputs calls.
- `src/app/api/workspace/route.ts`: bounded local request boundary; future authorized ingestion can call the service without inventing a provider connector.
- `src/app/tracker.tsx`: the operator interface.

Imported messages without explicit dependencies use limited relevant-text candidate retrieval; live mode assesses retrieved candidates with Decisions. Inferred discovery is labelled, and completeness is not guaranteed. Practice recognition intentionally focuses on the documented examples; unfamiliar edited statements may require human review. Buyer statements are reported evidence, not independently verified company truth.

The fixtures use an explicit reference date of **10 October 2026** and **Asia/Calcutta** timezone. Relative phrases such as “next quarter” remain text until an operator establishes a date.

## Deliverables and branch flow

See the [founder demonstration script](docs/founder-demo.md), [validation record](docs/validation.md), and [desktop](docs/images/review-desktop.png)/[mobile](docs/images/review-mobile.png) screenshots.

`main` is untouched. `dev` originates from `main`; each feature branch originates from the updated `dev`, and tested PRs merge into `dev`. The implementation is split into foundation, correction engine, approval/audit, OpenAI integration, operator interface, and validation/documentation PRs.
