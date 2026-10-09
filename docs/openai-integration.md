# OpenAI integration

Verified against the official [Decisions guide](https://developers.openai.com/api/docs/guides/decisions) and OpenAI JavaScript SDK 7.32.0 on 10 October 2026.

- Dedicated endpoint: `POST /v1/decisions` via `client.decisions.create`.
- Currently documented supported model: `gpt-6-luna`.
- Minimum documented JavaScript SDK: 7.30.0; this project pins 7.32.0.
- Requests have shared `input`, a `model`, and named `questions`. This implementation uses fixed-choice questions. Responses contain named answers, selected choices, confidence, probability distributions, and input-token usage. Refusals are per-question and never authorize repair.
- Image inputs, if added later, must be inline base64 data URLs in user `input_image` parts. External URLs and file IDs are unsupported; the documented maximum is 128 images. The MVP supplies text evidence and does not upload screenshots.

Decisions perform judgments only. A separate Responses API call with strict JSON Schema Structured Outputs extracts replacement values, exact excerpts, and summaries. Quotes are checked against the original reply. An optional second Responses call suggests drafts only after message-impact and capability checks. Independent questions are batched; impact questions run after correction judgments.

Configure `TRACKER_OPENAI_KEY` securely on the server (or an existing `OPENAI_API_KEY`). Never place keys in `NEXT_PUBLIC_` variables, Git, exported data, browser code, or chat. `TRACKER_GENERATION_MODEL` defaults to `gpt-6-luna` and can be overridden for the separate Responses tasks. Account/model access must be verified separately.

The status indicator checks credential presence only; it makes no API call. Live evaluation occurs only after an operator explicitly clicks Evaluate. Missing credentials or upstream failures do not trigger practice fallback. No live call has been verified in this environment.

Requests use a 20-second timeout and zero automatic retries. An evaluation performs at most two Decisions calls and two Responses calls, caps relevant fact/message counts and input sizes, and bounds generated output. Identical evidence, instructions, mode, and model versions may reuse stored evaluations. Draft generation can be disabled.

The official Decisions guide currently lists standard input pricing of $0.10 per million tokens, with regional and long-context qualifications. The application records returned decision and generation input usage separately. It does not apply that rate to Responses calls. Cost displays require explicit reviewed pricing configuration; unconfigured costs remain unavailable.
