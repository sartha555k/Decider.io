# OpenAI integration

Verified against the official [Decisions guide](https://developers.openai.com/api/docs/guides/decisions) and OpenAI JavaScript SDK 7.32.0 on 10 October 2026.

- The guide states that **gpt-6-luna is the only currently available supported model**. It does not establish support for other GPT-6-or-later models or GPT-5 nano.
- The sole API endpoint used by this application is `POST /v1/decisions`, via `client.decisions.create`. There are no Responses, chat completion, or generation calls.
- Minimum documented JavaScript SDK: 7.30.0; this project pins 7.32.0.
- Requests have shared `input`, a `model`, and named `questions`. This implementation uses fixed-choice questions. Answers contain choices, confidence, probability distributions, and input-token usage. Refusals never authorize repair.
- Image inputs, if added later, must be inline base64 data URLs in user `input_image` parts. External URLs and file IDs are unsupported. This application supplies text evidence.

The guide documents predicate, choice, and score question types. Decisions does not generate arbitrary replacement fields or email drafts. The application splits the buyer reply into exact statements and asks Decisions to select a statement ID for each corrected fact, alongside relation and scope judgments. Selected statement text becomes a proposed buyer-reported value and is verified against the original reply. An operator can edit it before approval; edited values retain operator provenance. Missing evidence, low confidence, unclear scope, or a statement longer than 500 characters routes the correction to further research rather than automatic replacement. Replies with more than eight statements remain intact as one candidate rather than being truncated.

A second Decisions request checks whether candidate follow-ups depend on corrected facts or repeat outdated assumptions. Live mode proposes pausing affected follow-ups and does not generate replacement drafts. Practice mode retains its explicitly simulated draft examples. Sent mail is untouched; explicit opt-out immediately stops local outreach.

Configure only `TRACKER_OPENAI_KEY` securely on the server (or an existing `OPENAI_API_KEY`) and spending limits from `.env.example`. Never expose credentials through browser variables or Git. Obsolete `TRACKER_GENERATION_*` settings are ignored and can be removed. Credential presence does not verify account/model access; no live call has been verified in this environment. Selecting Live makes no API call. Evaluation requires an explicit click and never falls back silently to practice.

Requests use a 20-second timeout and zero automatic retries. Each uncached evaluation makes at most two Decisions requests, with at most 64 KB of serialized input per request. The cache revision changed to exclude evaluations produced by the previous generation integration. Historical generation usage remains in stored reviews and is labelled historical in the UI.

The official guide lists standard input pricing of **$0.10 per million tokens**, with no cache-read, cache-write, or output-token charges. Regional premiums and long-context multipliers apply; review your actual processing-tier price. The spending guard reserves `2 × 64,000 × configured input price / 1,000,000` before an uncached evaluation: $0.0128 at the standard rate. No generation pricing is required.

Defaults are **two uncached live evaluations per UTC day**, **$0.05 reserved per UTC day**, and **$1 reserved per UTC calendar month**. Limits are enforced transactionally against the persisted SQLite ledger across restarts. Keep the database intact to retain limits. Failed calls do not refund reservations; cached evaluations make no new request. Setting either budget to zero blocks new uncached live evaluations. These app controls estimate this installation's spending; they do not cap other API key use or guarantee an account-wide bill. Practice mode makes no API calls. User-facing audit times use Asia/Calcutta.
