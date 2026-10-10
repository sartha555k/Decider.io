# Render private pilot

Deploy the integrated Next.js interface and API as one Render web service. SQLite requires persistent storage; the Blueprint attaches a 1 GB disk and runs one paid Starter service. Review the current service and disk prices in the Render dashboard before provisioning. A separate Vercel frontend would require separating the API and database architecture.

## Create the service

1. Sign into [Render](https://dashboard.render.com/) and connect GitHub with access to `sartha555k/Decider.io`.
2. Choose **New → Blueprint**, select the repository, and select **main** as the Blueprint source branch. Use the repository-root `render.yaml` file. The production release includes the reviewed fixes and private deployment configuration.
3. Review Render's validation and resource preview: one web service, one instance, paid Starter plan, and a 1 GB disk mounted at `/var/data/tracker`. No additional database service is needed. Automatic Git deployments are disabled.
4. Enter `TRACKER_OPENAI_KEY` in Render's secure environment input. This is a server credential; do not put it in Git or browser-visible variables. Render generates `TRACKER_AUTH_PASSWORD`; the username is `operator`.
5. Apply the Blueprint and wait for the build and `/api/health` check to pass. Open the HTTPS service URL shown by Render. Find the generated operator password in the service's environment settings and enter it in the browser login prompt.

The Blueprint builds with `npm ci --no-audit --no-fund && npm run build`, then starts with `npm start -- --port $PORT`. The start command sets `TRACKER_APP_ORIGIN` from Render's HTTPS service hostname so the existing cross-origin protection works behind its TLS proxy. Set this variable explicitly to the canonical HTTPS origin if using a custom domain. `package.json` requires Node 24. Durable records and spending reservations live at `/var/data/tracker/tracker.sqlite`. The health route checks access configuration and SQLite availability without exposing records or calling OpenAI.

The configuration was checked against Render's published field references in [render-oss/skills](https://github.com/render-oss/skills/tree/main/skills/render-blueprints/references). Direct access to Render's documentation and live schema was denied from the cloud workspace. Dashboard Blueprint validation and actual provisioning remain necessary before calling this deployed.

## Verify without spending API tokens

Open the URL in a private browser window. The app and workspace API should require a login; `/api/health` should return `{"status":"ok"}` without a login. Missing or invalid production access configuration returns 503 and fails the health check.

After login, use **Practice**, evaluate a CRM correction, approve it, and inspect research, paused follow-ups, and history. Restart the service from Render and confirm the approved records remain. This verifies that the app uses the attached disk. Mode selection and Practice evaluation do not call OpenAI.

An explicit **Live → Evaluate reply** makes a paid API request on a cache miss. The Blueprint permits two uncached evaluations per UTC day, $0.05 daily reserved cost, and $1 monthly reserved cost. These are app-level estimates; Render hosting charges are separate. Account and model access must be verified by the operator. Deployment preparation does not test the real key.

## Operate the pilot

Use the HTTPS URL. The password is shared operator access, with no individual accounts or roles. Use a private window for testing; browsers may retain Basic login credentials until the window is closed. Rotate the password in Render's environment settings when needed.

Develop changes through PRs into `dev`, then promote an approved release through a PR into `main`. Deploy manually from `main` after CI passes. The persistent disk supports one instance; keep autoscaling disabled. Disk-backed deployments can briefly interrupt access. Move to a managed database and individual authentication before expanding to a multi-user service.

Do not delete the disk to reset a scenario. Review history provides guarded reversal while preserving evidence. Before migrations or other destructive maintenance, take an application-consistent SQLite backup: stop writes and copy the database, or use SQLite's native backup facility. Keep any WAL/SHM files with a backup taken from a stopped process. Do not rely on filesystem snapshots alone for database consistency.

Local databases are ignored by Git and are not uploaded by this Blueprint. The hosted service starts with fictional fixtures, and preserves subsequent changes on its disk. This pilot does not send emails or write to HubSpot.
