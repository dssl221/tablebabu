# Local stress test — 6 October 2026

Result: **FAIL for concurrent ordering**. No application code was changed to hide or bypass failures.

Environment: existing local development server and PostgreSQL, single machine and client IP. Synthetic API workload with 100 seeded customer sessions, one temporary restaurant and 51 connected WebSockets. This is a short burst test, not a sustained soak, browser rendering test, distributed load test or production capacity certification.

| Operation | Concurrent requests | Requests | Successful | HTTP 500 | p95 latency |
|---|---:|---:|---:|---:|---:|
| Menu | 10 | 200 | 200 | 0 | 60 ms |
| Menu | 50 | 200 | 200 | 0 | 311 ms |
| Menu | 100 | 200 | 200 | 0 | 615 ms |
| Place order | 10 | 100 | 99 | 1 | 1,647 ms |
| Place order | 25 | 100 | 89 | 11 | 3,294 ms |
| Place order | 50 | 100 | 80 | 20 | 4,785 ms |

32 of 300 normal order submissions failed (10.7%). The application stayed running and its health endpoint returned 200 after the test. Order transaction contention is a candidate cause: each serializable order transaction updates the same restaurant counter, with bounded retries. Confirm the database error codes before choosing a fix.

Integrity and security checks passed for committed orders:

- Ten simultaneous identical submissions produced one order (one 201, nine 200 responses).
- All 288 committed orders across all phases had correct database-derived pricing and unique order numbers.
- The owner socket received exactly 288 new-order events, without duplicate events in this connected run.
- All 51 test WebSockets connected successfully.
- Order quota test returned 19 successes and 11 expected 429 responses. Fixed-window timing means the accepted count need not equal the remaining quota at test start.
- New-session quota test returned 20 successes and five expected 429 responses.

An initial 3,000-menu-request burst exhausted the 1,200-request/minute global per-IP limit, causing subsequent requests, including health checks, to receive 429. Its ordering results are inconclusive; the second run above stayed below that global quota. The shared-IP impact matters for restaurant Wi-Fi users and should be evaluated before deployment without simply removing protections.

Temporary restaurant, menu, orders, sessions and owner records were removed. Application throttle counters expire normally. Existing business records were not modified.

Raw results: `stress-test.json`; initial limiter experiment: `stress-test-ip-limit.json`.

Repeat with `npx tsx scripts/stress-test.ts` against the running local app, leaving at least one minute between runs. The script exits nonzero for unexpected HTTP failures. Session credentials are seeded only for the order-load scenario; public session creation is tested separately. No authentication tokens or passwords are written to the report.
