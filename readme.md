# Buyer Correction Tracker

Proposed module for Rhycon with fictional seller and prospect data. No Rhycon integration or endorsement is claimed.

## Foundation milestone

Next.js, TypeScript, persistent SQLite storage, and the primary fictional Salesforce-to-HubSpot scenario. This first feature branch previews the context, evidence, reply, and local demonstration queue. Evaluation, approvals, additional scenarios, and OpenAI integration follow through separate PRs.

## Development

Use Node.js 24; storage uses built-in `node:sqlite`.

```sh
npm ci
npm run dev
```

The server uses port 3000. The database is created automatically at `data/tracker.sqlite`, outside source control. `TRACKER_DATABASE_PATH` overrides it. No credentials are needed for this milestone or future practice mode.

```sh
npm test
npm run typecheck
npm run build
npm start
```

In the cloud environment use `npm ci --cache /workspace/.cache/npm` if the home cache is not writable. Tests cover persistence across restarts, seed idempotency, scoped reads, duplicate reply ingestion, and transaction rollback. No live OpenAI calls are made.

## Branch workflow

`main` remains untouched. Feature branches originate from `dev` and are merged into `dev` through tested PRs.

## Trust and scope

Seller capabilities and prospect facts are separate. The dated job posting is research evidence, not proof of current use. Messages store fact and claim dependencies. The general follow-up has no CRM dependency; already-sent outreach stays in history. No email, meeting, or external CRM actions are performed.

The fixture uses reference date 10 October 2026 and Asia/Calcutta timezone. Relative dates are not resolved into invented exact dates.
