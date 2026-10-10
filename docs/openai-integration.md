# OpenAI integration

Verified against the official [Decisions guide](https://developers.openai.com/api/docs/guides/decisions) and OpenAI JavaScript SDK 7.32.0 on 10 October 2026.

- Dedicated endpoint: `POST /v1/decisions` via `client.decisions.create`.
- Currently documented supported model: `gpt-6-luna`.
- Minimum documented JavaScript SDK: 7.30.0; this project pins 7.32.0.
- Requests have shared `input`, a `model`, and named `questions`. This implementation uses fixed-choice questions. Responses contain named answers, selected choices, confidence, probability distributions, and input-token usage. Refusals are per-question and never authorize repair.
- Image inputs, if added later, must be inline base64 data URLs in user `input_image` parts. External URLs and file IDs are unsupported; the documented maximum is 128 images. The MVP supplies text evidence and does not upload screenshots.

Decisions perform judgments only. A separate Responses API call with strict JSON Schema Structured Outputs extracts replacement values, exact excerpts, and summaries. Quotes are checked against the original reply. An optional second Responses call suggests drafts only after message-impact and capability checks. Independent questions are batched; impact questions run after correction judgments.

Configure `TRACKER_OPENAI_KEY` securely on the server (or an existing `OPENAI_API_KEY`). Never place keys in `NEXT_PUBLIC_` variables, Git, exported data, browser code, or chat. `TRACKER_GENERATION_MODEL` defaults to `gpt-5-nano` and can be overridden for the separate Responses tasks. Account/model access must be verified separately.

The status indicator checks credential presence only; it makes no API call. Live evaluation occurs only after an operator explicitly clicks Evaluate. Missing credentials or upstream failures do not trigger practice fallback. No live call has been verified in this environment.

Requests use a 20-second timeout and zero automatic retries. An evaluation performs at most two Decisions calls and two Responses calls, caps relevant fact/message counts and input sizes, and bounds generated output. Identical evidence, instructions, mode, and model versions may reuse stored evaluations. Draft generation can be disabled.

The official Decisions guide currently lists standard input pricing of $0.10 per million tokens, with regional and long-context qualifications. The application records returned decision and generation input usage separately. It does not apply that rate to Responses calls. Decision and generation cost estimates are displayed separately when returned usage and reviewed pricing are available. Unconfigured generation costs remain unavailable.

The [GPT-5 nano model guide](https://developers.openai.com/api/docs/models/gpt-5-nano), reviewed on 10 October 2026, lists standard text prices of $0.05 input and $0.40 output per million tokens and Structured Outputs support. Those prices are the defaults only for `gpt-5-nano`; switching to another Responses model requires explicitly configured reviewed input/output prices. Minimal reasoning keeps the short extraction and optional draft requests economical. Model access and live behavior remain unverified. The server reserves a conservative maximum cost before any uncached evaluation, persists reservations across restarts, and enforces configured daily/monthly dollar and daily evaluation limits. The reservation assumes at most two requests to each endpoint, at most 64 KB of serialized input per request, and bounded generation output. Reservations are intentionally not refunded after failures; cached evaluations consume no additional reservation. Configure actual regional/tier prices for the selected models. Limits use UTC days, while user-facing audit times use Asia/Calcutta. These are estimated spending controls, not a substitute for provider billing limits.

Default limits are **two uncached live evaluations per UTC day**, **$0.05 reserved per UTC day**, and **$1 reserved per UTC calendar month**. The monthly limit covers reservations on every day in that month; restarting the server does not reset the persisted ledger. Keep the SQLite database intact to retain limits. Setting either dollar budget to zero blocks all uncached live evaluations, including the first one. Practice mode makes no API requests. Optional live draft generation is off initially, and the client does not automatically retry API calls. Live requests may still incur charges; these limits cover this installation and do not cap other use of the API project/key.
