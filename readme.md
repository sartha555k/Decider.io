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

Production requires `TRACKER_AUTH_USERNAME` and a `TRACKER_AUTH_PASSWORD` of at least 16 characters in server-side environment settings. The username accepts letters, numbers, dots, underscores, and hyphens. Configure them before starting the preview; missing or invalid settings make production return 503. The browser prompts for these credentials. Development stays open only when both access settings are unset.

For a hosted private pilot, see the [Render deployment guide](docs/render-deployment.md) and [Blueprint](render.yaml). The integrated Next.js app serves both the interface and API on one service with persistent SQLite storage.

The SQLite database is created automatically at `data/tracker.sqlite`. Set `TRACKER_DATABASE_PATH` to a persistent writable location to override it. Live processes must be restarted after environment restoration. Keep the database, WAL, and SHM files together when backing up a running database, or stop the app before copying the database file.

## Try the workflow

Select one of twelve clearly fictional scenarios. Edit the prospect reply and seller HubSpot capability, then click **Evaluate reply**. Practice evaluations are deterministic simulations without model probabilities. Results identify specific affected follow-ups; the general introduction remains unaffected, and already-sent email stays in history.

Approve actions individually, edit proposed values or suggested drafts, or reject the proposal. Research changes preserve old facts and original evidence. Revised drafts remain paused. Changing inputs disables approval until reevaluation. Server-side version checks prevent stale repairs, and repeated approvals are safe.

Live evaluation compares the reply with **current saved research**, including previously approved corrections. If CRM already says HubSpot, repeating the HubSpot reply normally produces no new correction. The result explains this and shows a snapshot of the compared facts. Reused evaluations are labelled as cached and make no new API request. To demonstrate the original change again, inspect Review history and revert the earlier repair when eligible; do not delete evidence or the database to reset a demonstration.

Use **Local follow-ups** in the desktop sidebar or mobile navigation to inspect saved messages before evaluating. Their status is shown as queued, draft, paused, cancelled, or sent; an unevaluated message is not labelled unaffected. Return to **Reply review** to evaluate and approve repairs.

**Data quality & usage** shows current facts, buyer-reported facts, preserved superseded facts, missing evidence, and pending follow-ups still referencing superseded research for the selected scenario. Select an evaluation to report a missed correction or an incorrect flag, or open it for review. Feedback is saved in the local audit history. Section links support reload and browser back/forward navigation.

An explicit opt-out immediately suppresses the replying contact and cancels their pending local outreach. It never generates a new pitch. Approved internal repairs can be reverted through a new audited action only while their records remain unchanged. Reversal preserves buyer evidence and increments record versions. Future external integrations may have different reversal limits.

This is a **single-operator demonstration** with a shared operator password for hosted private access. It does not provide individual user accounts or roles. All sample data is fictional. No real email sending, meeting booking, external CRM update, or invented Rhycon connector is included.

## OpenAI integration

You do not need to build another API service or obtain a separate Decisions API key. The existing server uses an OpenAI API project key for Decisions calls, subject to your account's model access. A ChatGPT subscription or this chat session does not configure the app's API credentials or billing. Store credentials only in a server-side environment file such as `.env.local`, review the Decisions price and spending limits listed in `.env.example`, restart the app, and explicitly evaluate in Live mode. Never commit the key.

Practice mode works without credentials. Live mode uses server-side OpenAI’s dedicated Decisions API (`gpt-6-luna`, SDK 7.32.0) for correction and impact judgments. Decisions selects exact statements from the buyer reply as proposed values; operators can edit them before approval. Live mode flags and pauses affected follow-ups without generating email drafts. Selected statements must match source text. Raw upstream errors and credentials are not returned to the browser.

Configure a server-side credential securely and reviewed Decisions pricing using [.env.example](.env.example). Never place keys in browser-visible variables, Git, exported files, or chat. The status indicator reports credential presence, not verified model access. Mode selection makes no API call; explicit evaluation is required. Live mode never silently falls back to practice.

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
- `src/lib/openai.ts`: the documented Decisions protocol; Live mode makes no generation calls.
- `src/app/api/workspace/route.ts`: bounded local request boundary; future authorized ingestion can call the service without inventing a provider connector.
- `src/app/tracker.tsx`: the operator interface.

Imported messages without explicit dependencies use limited relevant-text candidate retrieval; live mode assesses retrieved candidates with Decisions. Inferred discovery is labelled, and completeness is not guaranteed. Practice recognition intentionally focuses on the documented examples; unfamiliar edited statements may require human review. Buyer statements are reported evidence, not independently verified company truth.

The fixtures use an explicit reference date of **10 October 2026** and **Asia/Calcutta** timezone. Relative phrases such as “next quarter” remain text until an operator establishes a date.

## Deliverables and branch flow

See the [founder demonstration script](docs/founder-demo.md), [validation record](docs/validation.md), and [desktop](docs/images/review-desktop.png)/[mobile](docs/images/review-mobile.png) screenshots.

`dev` originates from `main`; each feature branch originates from the updated `dev`, and tested PRs merge into `dev`. The initial release was promoted to `main` through PR #8. Later fixes and deployment preparation remain on `dev`; the Render Blueprint deploys that branch manually. The implementation is split into foundation, correction engine, approval/audit, OpenAI integration, operator interface, and validation/documentation PRs.

## Low-cost API defaults

Practice mode makes no API calls. Live evaluation uses only `POST /v1/decisions` with the documented supported model `gpt-6-luna`. There are no Responses or GPT-5 nano calls. Decisions selects buyer statements and assesses follow-up impacts; operators review/edit values and approve pauses. No generated replacement draft is offered in Live mode. Defaults allow two uncached evaluations per UTC day, $0.05 in daily reserved cost, and $1 in monthly reserved cost. Reservations persist in SQLite and require only the Decisions input price. These are app-level estimates, not a guarantee against API account charges. Set `TRACKER_DAILY_BUDGET_USD=0` for zero new live spending.
