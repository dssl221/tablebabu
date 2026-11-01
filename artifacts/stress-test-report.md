# Concurrent ordering fix verification — 7 October 2026

**Local fixes, burst tests, and the final 15-minute soak passed. Staging VPS validation remains pending.** No load-test failures have been suppressed. Expected throttling and intentional fault injection are reported separately.

## Confirmed causes

The original serializable order transaction read a restaurant and then updated the same restaurant row to allocate a number. Diagnostic reproduction used an equivalent parameterized raw UPDATE to expose PostgreSQL's code: **925 failed attempts, all SQLSTATE `40001`, all at counter allocation**, reported through Prisma `P2010`. Eighteen requests exhausted the existing eight retries in that reproduction; the original uninstrumented baseline had 32/300 failures. The evidence supports serialization contention, not pool exhaustion or a transaction/lock timeout.

Distributed mixed traffic also exposed exhausted **Prisma `P2034` conflicts in bill/help creation** (64 failures, then 63 in the diagnostic repeat). Serializing that operation on the customer-session row removed these conflicts.

A regression exposed **PostgreSQL `40P01` in simultaneous onboarding launches**. Both transactions could acquire child foreign-key locks before upgrading the parent restaurant lock. Locking the parent first fixed the acquisition order. The existing bounded helper now recognizes PostgreSQL conflict codes wrapped as Prisma unknown errors; its retry limit was not increased.

Evidence: [original report](stress-test-report-before.md), [925 error details summarized](diagnostic-error-summary.json), [instrumented baseline](stress-test-diagnostic-baseline.json), [mixed diagnostic run](stress-platform-diagnostic.json).

Other observed failures are distinguished: an isolated test deliberately generated `22003` numeric overflow to prove rollback/no event; an early direct-counter test harness hit Prisma's default two-second acquisition timeout and was corrected to use the application's ten-second acquisition budget. Neither was the original order failure. The pool was not enlarged.

## Implementation

- `Restaurant.orderCode` is globally unique, validated and immutable. Generated codes use `H` plus a platform sequence in uppercase hexadecimal; that sequence identifies hotels, not orders. `RESTAURANT_ORDER_CODE=AMAN` optionally selects a custom code when provisioning a new hotel with `npm run restaurant:create`. The code is displayed read-only in settings and never follows an editable name.
- `RestaurantOrderCounter` has primary key `(restaurantId, year)`. Allocation uses PostgreSQL `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`. No main restaurant-row update, application-memory counter, or `MAX + 1` allocation remains.
- `Order.orderNumber` is unique text, with additional uniqueness on `(restaurantId, orderYear, orderCounter)`. Database triggers verify the identity and prevent later changes.
- The backend determines the year in `Asia/Kolkata`. Formatting is `code + ':' + year + ':' + String(counter).padStart(6, '0')`: `AMAN:2026:000001`. New years naturally create a separate row starting at 1; values beyond six digits are not truncated. Client years are ignored. A single backend timestamp supplies both the IST year and stored order creation time, including transactions crossing midnight.
- Migration preserves old numeric references in `legacyOrderNumber`, backfills IDs using each order's IST creation year, and initializes historical high-water marks. Already-issued receipt HTML remains unchanged.
- Order creation uses read-committed isolation with a customer-session `FOR UPDATE` lock and shared restaurant/item/category locks. Authoritative pricing, menu state, tenant relationships and session/payment checks are protected until commit. Session timestamp writes also invalidate stale serializable settlement snapshots.
- Duplicates are found before counter allocation. Order and item inserts commit atomically; inserted items are returned directly, keeping the counter lock short. Other hotels use independent counter rows. Notifications happen only after commit.
- Known order/bill transaction conflicts get at most two retries with jitter. Exhausted temporary contention returns controlled 503 plus `Retry-After`; unknown failures remain errors. Order/bill acquisition budget is ten seconds and transaction execution budget fifteen seconds, with the existing nine-connection local application pool unchanged.

Full invariant explanation and deployment requirements: [ORDERING-CONCURRENCY.md](../ORDERING-CONCURRENCY.md).

## Single-hotel hotspot

The 7 October resumed isolated run used the final implementation, including the shared creation-time/IST-year guard, after browser regressions had finished. Times are milliseconds. The original concurrency-50 run had 100 requests; the final required run has 200. No original concurrency-100 baseline exists.

| Concurrency | Baseline failures / requests | Baseline p95 | Final failures / requests | Final p50 | Final p95 | Final p99 | Final statuses |
|---:|---:|---:|---:|---:|---:|---:|---|
| 10 | 1 / 100 | 1,647 | 0 / 100 | 90.8 | 232.2 | 387.8 | 201 x 100 |
| 25 | 11 / 100 | 3,294 | 0 / 100 | 237.4 | 353.4 | 429.6 | 201 x 100 |
| 50 | 20 / 100 | 4,785 | 0 / 200 | 499.9 | 621.3 | 720.1 | 201 x 200 |
| 100 | Not measured | — | 0 / 200 | 1,071.5 | 1,332.5 | 1,780.5 | 201 x 200 |

**600/600 normal orders succeeded, no 500 or 503 responses.** All four p95 values met the local 1–1.5 second target; this is not a production SLA.

- Ten identical simultaneous submissions: **one 201, nine 200, one order/number/event**.
- Fifty rapid order attempts on one session: **14 accepted, 36 throttled**. Prior attempts consumed part of its fixed-window quota.
- 620 session-creation attempts on one restaurant/IP: **300 created, 320 throttled**.
- Across all order phases: **615 committed orders = 615 owner events**, correct database prices despite manipulated client totals, unique numbers, and healthy API afterward.
- Menu: 200 reads at concurrency 10/50/100 all returned 200; p95 was 50.8/203.4/466 ms. No speculative caching was introduced; availability remains authoritative.

Raw results: [stress-test.json](stress-test.json). A run overlapping browser tests also had zero order failures but higher latency and is retained in [stress-test-with-browser-tests.json](stress-test-with-browser-tests.json).

## Distributed platform burst (final revision)

100 hotels with individual codes, two categories/items per hotel, 1,000 initially active guest sessions, and 300 sockets (100 owners, 200 guests), all on one IP. Credentials were seeded to isolate ordering from authentication/session-creation quotas; the public creation quota was separately tested above.

| Workload | Requests | Concurrency | p50 ms | p95 ms | p99 ms | Status distribution |
|---|---:|---:|---:|---:|---:|---|
| Distributed orders | 1,000 | 100 | 1,259.8 | 1,557.7 | 1,785.3 | 201 x 1000 |
| Orders, bills and menus | 1,500 | 100 | 973.9 | 1,829.1 | 2,290.7 | 200 x 1000; 201 x 500 |
| Shared-IP menu burst | 3,000 | 100 | 501.2 | 944.2 | 1,095.4 | 200 x 3000 |

The final distributed order p95 was 1.56 seconds and mixed-operation p95 was 1.83 seconds: above the approximate 1-1.5 second aim at this burst level, despite zero failures. No pool size or retry limit was raised to hide that result. After the menu burst, an order still returned 201 and health returned 200. A separate middleware test sent 12,010 menu requests: **12,000 allowed, ten throttled**, while order/health quotas remained accessible on the same IP. Stricter auth/account and per-session order/service quotas remain enabled.

## Soak and profiling

The final-revision run completed on 7 October from **18:01:31 to 18:17:40 IST** (raw artifacts use UTC). Sustained phases ran **908.59 seconds**, with 14 batches totaling **1,680 soak orders**. Including distributed bursts and the shared-IP order check, **3,181 orders committed and exactly 3,181 owner events arrived**. Every integrity and health check passed; there were **zero unexpected HTTP failures, zero transaction retries, and zero database failures**.

Soak batch p95 ranged from **55.5 to 101.6 ms**; the largest batch p99 was **2,245.9 ms**. These occasional tail spikes remain in the raw results. The sustained workload was about 1.8-1.9 orders/second plus menu reads, after separate concurrency-100 bursts; it was not 1,000 simultaneous submissions.

Final distributed transaction timing p50/p95/p99, milliseconds:

| Stage | p50 | p95 | p99 |
|---|---:|---:|---:|
| Acquisition + BEGIN | 3.01 | 787.05 | 942.38 |
| Pricing and locks | 11.64 | 49.75 | 78.99 |
| Counter allocation | 3.35 | 107.73 | 173.81 |
| Order insertion | 4.58 | 16.24 | 28.67 |
| Item insertion | 3.51 | 13.82 | 28.65 |
| Commit round-trip | 2.58 | 11.32 | 20.34 |

Across 194 five-second runtime samples, RSS p95 was **383.78 MiB**, maximum **446.86 MiB**, ending **153.61 MiB**; heap maximum was **260.77 MiB**, ending **75.68 MiB**. CPU p95 was **80.19%**, maximum **191.64%** (100% is one core). Sampled event-loop p99 peaked at **500.43 ms**. PostgreSQL samples saw up to six active connections, eleven idle, eight temporarily idle inside transactions, and three lock waiters. Pending order starts peaked at 32 in five-second samples; the finer lifetime gauge recorded 82. No pool-acquisition failures occurred. Application pool maximum remained nine.

The test owned 300 sockets; total process samples reached 302, reflecting up to two additional connections outside the test. One non-test connection remained afterward. Post-load observations showed zero active/pending order transactions, zero idle-in-transaction database connections, and nine idle application pool connections. The test disconnected all of its own sockets. These short observations do not prove absence of memory leaks; timer/listener growth and PostgreSQL host CPU/I/O/network were not directly measured.

Environment: Windows local development server, AMD Ryzen 5 7520U (4 cores/8 logical processors), approximately 7.3 GiB reported physical RAM, application and PostgreSQL on the same machine. This is not a VPS capacity certification.

Evidence: [final platform result](stress-platform.json), [phase log](resumed-platform.txt), [scoped final profile](resumed-platform-performance.json), [cleanup verification](stress-cleanup-verification.json).

An earlier 15-minute soak also passed and is retained in [first-pass evidence](stress-platform-first-pass.json). An intervening repeat was interrupted before final checks and is **not counted as a pass**; its cause cannot be established from retained logs. On resume, its 100 test hotels and 3,163 test orders were removed using the saved manifest. See [interrupted log](stress-platform-release.txt), [recovery record](interrupted-stress-cleanup.json), and [saved interrupted manifest](interrupted-stress-context.json). The completed final run above supersedes that incomplete verification.

Final hotspot transaction timings (624 transaction calls, including nine idempotent returns):

| Stage | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|
| Acquisition + BEGIN | 118.63 | 424.37 | 466.94 |
| Session lock | 2.66 | 10.02 | 144.56 |
| Pricing and locks | 9.82 | 18.24 | 25.02 |
| Counter allocation, including wait | 28.29 | 171.66 | 425.22 |
| Order insertion | 3.87 | 7.42 | 11.26 |
| Item insertion | 2.55 | 5.69 | 8.24 |
| Commit round-trip | 1.92 | 4.38 | 6.74 |

Hotspot retries: **0**. Hotspot database failures: **0**. Application pool maximum: **9**, unchanged; PostgreSQL `max_connections`: **100**, unchanged. Up to **49 pending order transaction starts** were observed, not an independently measured Prisma engine queue. The resumed process samples include the preceding targeted tests and subsequent idle period; transaction timings are restricted to the hotspot restaurant. Acquisition and commit timings include engine/protocol overhead.

Evidence: [resumed-hotspot-performance.json](resumed-hotspot-performance.json). Database activity counts include the observer/test clients, not just the application. Internal Prisma query-queue length is not exposed; application transaction backlog is measured separately. No large observability stack or new infrastructure was added.

## Regressions and changed files

- **33 unit tests passed**, covering IST rollover, numbering, safe SQLSTATE classification and route-family abuse isolation.
- The full browser run passed 22/23 scenarios; its remaining launch deadlock was fixed and the three onboarding scenarios passed afterward. A new settlement/rollback scenario passed too: **24 distinct browser scenarios covered across full and targeted runs**.
- Numbering tests cover independent hotel batches, `2026:004827` to `2027:000001`, rollback, rename stability, duplicate-code rejection and immutable identity.
- Ten simultaneous bill requests store one pending request; service quota and no-post-bill-order behavior pass.
- Settlement and an incompatible extra order never both succeed. Deliberate `22003` insertion failure rolls back the counter, stores no extra order, and emits no event.
- On 7 October, both targeted numbering/settlement tests passed again, including the creation-year assertion. Production build, TypeScript checks and production dependency audit passed; audit reported zero known vulnerabilities. Runtime tests used the development server.

Principal changes:

- Schema/migrations: `prisma/schema.prisma`, `20261006130000_yearly_order_numbers`, `20261006131000_order_identity_guards`.
- Ordering: `src/server/order-placement.ts`, `session-transaction.ts`, `database-errors.ts`, `db.ts`, `api.ts`, `onboarding.ts`.
- Limits/diagnostics: `traffic-limits.ts`, `performance-diagnostics.ts`, `transaction-load.ts`, `server.ts`, `.env.example`.
- Display/reports/provisioning: `src/lib/types.ts`, `src/server/receipt.ts`, `transaction-report.ts`, `src/components/management.tsx`, `src/app/globals.css`, `scripts/create-restaurant.ts`.
- Verification: stress, cleanup, context and telemetry scripts; numbering/race/limiter tests; existing journey/onboarding/employee/receipt test updates.
- Documentation: `package.json`, `README.md`, `SECURITY.md`, `ORDERING-CONCURRENCY.md`, and evidence artifacts.

## Cleanup and final application state

The final hotspot cleaned its fixture records and scoped throttle rows automatically. Recovery of the interrupted platform run used only saved IDs, matching hotel codes/slugs, and dedicated `@example.test` fixture owners; real restaurant data was not targeted. Verification found **zero stress restaurants, owners, counter rows, manifest throttle rows, and idle-in-transaction connections**. After load, application gauges returned to zero active/pending orders; all test sockets were disconnected, with one unrelated socket remaining. Nine idle pool connections remained as expected.

## Remaining limits

The development application was restarted with performance diagnostics disabled after verification; `/api/health` returned HTTP 200. Local PostgreSQL remains running.

- No staging VPS was supplied. Production-like VPS, ingress/TLS, network and database-host utilization testing remain unperformed. Local figures are not capacity certification.
- Socket tests establish one event per committed order while connected, not durable exactly-once delivery across process crashes between commit and emit. Existing reconnect recovery fetches authoritative state. No outbox or cross-worker pub/sub was added.
- IP envelopes remain process-local; contextual account/session limits use PostgreSQL. Fixed-window boundary bursts and perimeter protection requirements remain.
- Existing receipt snapshots retain original references. Deploy schema and application together with old workers stopped; grant runtime sequence usage as documented.
