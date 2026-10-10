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
| Unit/integration tests         | 65 passed, 0 failed                               |
| Browser tests                  | 24 passed, 0 failed (desktop and mobile Chromium) |
| Production build               | Passed                                            |
| TypeScript                     | Passed                                            |
| Prettier / patch whitespace    | Passed                                            |
| HTTP repair-and-reversal smoke | Passed                                            |
| Live OpenAI calls              | Not run; account/model access unverified          |

Unit/integration calls are mocked or simulated. Browser tests isolate their database and explicitly omit API credentials.

## Limits and remaining verification

Live OpenAI behavior remains unverified until server credentials, account/model access, and reviewed Decisions pricing are configured. The official Decisions guide and SDK protocol were verified; this does not establish account authorization.

This is a single-operator demonstration with shared password protection for hosted private access. It has no individual accounts, real mail delivery, meeting booking, external record updates, or a Rhycon connector. The Render Blueprint and private access controls are prepared; an actual hosted service has not been provisioned. See the [deployment guide](render-deployment.md).

Practice parsing is intentionally bounded to demonstrable correction patterns. Inferred retrieval does not guarantee full dependency coverage. Model probabilities and cost estimates are not guarantees; quality counters represent local operator feedback, not measured accuracy or revenue impact.
