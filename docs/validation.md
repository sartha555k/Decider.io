# Validation record

This record describes the selected local demonstration workflow, not a production deployment or live model verification.

## Verified locally

- Persistent SQLite fixture startup and restart, seed idempotency, scoped reads, unique ingestion identifiers, and transaction rollback.
- All five correction categories and the twelve fictional scenarios.
- Explicit/inferred message dependencies, sent-history preservation, general-message isolation, seller relevance, and team/contact scope.
- Multiple corrections, uncertainty, malicious reply instructions, exact excerpts, refusals, malformed API responses, and sanitized errors.
- Individually selected repairs, outstanding follow-up flags after partial approval, confirming replies, operator edits, stale-input/version rejection, safe repeated approval, audit preservation, and guarded reversal with increasing versions.
- Opt-out priority, contact suppression, cancellation of pending local outreach, and preservation of sent messages.
- Persistent conservative live spending reservations and evaluation quotas.
- Production build, TypeScript checking, HTTP repair smoke, and desktop/mobile browser flows.
- Keyboard entry, responsive overflow checks, and automated WCAG A/AA accessibility scans.

Final local results on 10 October 2026 (Asia/Calcutta):

| Check                          | Result                                            |
| ------------------------------ | ------------------------------------------------- |
| Unit/integration tests         | 45 passed, 0 failed                               |
| Browser tests                  | 16 passed, 0 failed (desktop and mobile Chromium) |
| Production build               | Passed                                            |
| TypeScript                     | Passed                                            |
| Prettier / patch whitespace    | Passed                                            |
| HTTP repair-and-reversal smoke | Passed                                            |
| Live OpenAI calls              | Not run; credentials intentionally deferred       |

Unit/integration calls are mocked or simulated. Browser tests isolate their database and explicitly omit API credentials.

## Limits and remaining verification

Live OpenAI behavior remains unverified until server credentials, account/model access, and reviewed generation pricing are configured. The official Decisions guide and SDK protocol were verified; this does not establish account authorization.

This is a local single-operator demonstration without authentication, real mail delivery, meeting booking, external record updates, or a Rhycon connector. A public hosted deployment is not provisioned by these commands; use the prepared server or run the documented preview commands in the selected environment.

Practice parsing is intentionally bounded to demonstrable correction patterns. Inferred retrieval does not guarantee full dependency coverage. Model probabilities and cost estimates are not guarantees; quality counters represent local operator feedback, not measured accuracy or revenue impact.
