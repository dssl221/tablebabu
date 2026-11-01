# Ordering concurrency and yearly hotel IDs

## Diagnosis

The original serializable order transaction read the restaurant and later updated its shared `nextOrderNumber`. Concurrent transactions repeatedly invalidated one another's snapshots. An equivalent parameterized raw UPDATE was used temporarily to expose PostgreSQL SQLSTATE rather than Prisma's abstract conflict error. The diagnostic reproduction captured 925 `40001` failures, all at counter allocation; 18 requests exhausted the original eight retries. The original uninstrumented run had 32 failures. See `artifacts/diagnostic-error-summary.json`. No retry count was increased.

Distributed testing also found exhausted `P2034` conflicts in the serializable bill/help transaction. Its pending-request predicate and inserts were replaced with serialization on the actual customer-session row. Unrelated admin transactions retain their existing serializable isolation.

## Order transaction and invariants

`src/server/order-placement.ts` runs a bounded read-committed PostgreSQL transaction:

1. Lock the authenticated restaurant's customer-session row `FOR UPDATE`.
2. Look up the session/idempotency key. Identical retries return the committed order; changed payloads return 409. No counter is allocated for duplicates.
3. Validate session status, expiry, and payment state.
4. Read the restaurant `FOR SHARE`, validating published/active/open/subscription/freeze state. This lock is compatible with other orders and prevents settings changes from invalidating validation before commit.
5. Lock selected menu items in deterministic ID order `FOR SHARE`, then their categories. Read availability, category activation, names and prices from the database. Item locks prevent a category move between these checks. Tenant constraints and server quantity validation remain in force.
6. Update the session timestamp. Besides the row lock, this write forces a stale serializable settlement transaction to abort/retry rather than settle a snapshot missing the new order.
7. Allocate the independent restaurant/year counter with PostgreSQL `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING`.
8. Insert the order and price/name snapshots atomically. Return inserted items directly, avoiding extra reads while holding the counter lock.
9. Commit, then emit `order:new`. Replayed submissions do not emit another event.

The session lock also protects bill/help deduplication and serializes bill requests against new orders. Existing serializable paid/close workflows retain their checks. Locks are held only for database work; no sockets, external APIs, or PDF generation run inside order creation. There is still a brief exclusive lock on the particular restaurant/year counter, but waiting transactions receive fresh committed values instead of repeatedly failing serializable snapshots. Other hotels use different counter rows.

Known transaction conflicts (`40001`, `40P01`, Prisma `P2034`) have at most two retries with short jitter. Pool/transaction/lock timeout exhaustion returns a controlled 503 and `Retry-After`, never fake success. Unknown errors remain failures. The application's nine-connection local pool was not increased. Order/bill interactive transactions allow up to 10 seconds for acquisition and 15 seconds execution; the wait budget is distinct from retry count and pool size.

## Identity and migration

- `Restaurant.orderCode`: globally unique, 2–16 uppercase alphanumeric characters, beginning with a letter. A database trigger makes it immutable. Generated codes use `H` followed by a platform sequence in uppercase hexadecimal; this sequence assigns hotel codes only, never shared order counters. Set optional `RESTAURANT_ORDER_CODE=AMAN` when using `npm run restaurant:create` to provision a new restaurant with a custom code. Codes are displayed read-only in restaurant settings and never derive from editable business names.
- `RestaurantOrderCounter`: primary key `(restaurantId, year)`, positive integer `currentCounter`, timestamps. No scheduled reset and no application-memory counter.
- `Order.orderNumber`: unique text; `orderYear` and `orderCounter` have an additional `(restaurantId, orderYear, orderCounter)` uniqueness constraint. Database triggers verify the formatted identity on insert and prohibit later identity changes.
- The backend determines `year` from `Asia/Kolkata`; client years are ignored. One backend timestamp supplies both the year and stored creation time so a transaction crossing IST midnight stays internally consistent. `code + ':' + year + ':' + String(counter).padStart(6, '0')` produces `AMAN:2026:000001`. Values exceeding six digits are not truncated.
- A missing restaurant/year row starts at 1 automatically. Counter allocation and order insertion share a transaction, so rollbacks currently undo the allocation; gaplessness is not a product guarantee.
- Migration assigns permanent codes to existing restaurants, preserves the previous numeric reference in `legacyOrderNumber`, converts order IDs using each order's IST creation year, and initializes historical high-water marks. `MAX` is used only once to migrate historical high-water marks, never to generate a new order.
- Already issued immutable receipt HTML remains unchanged. New receipts and current API/UI order references use the new ID.

Deploy both migrations with the old application workers stopped, then start the new version. This changes `orderNumber` from number to string and removes `nextOrderNumber`; mixed old/new application workers are unsupported. Back up the production database before deployment. A restricted runtime database role also needs `USAGE` on `restaurant_code_seq`.

## Traffic limits

Each route family has its own per-IP one-minute safety ceiling:

| Route family | Limit |
|---|---:|
| Public restaurant/menu GET | 12,000 |
| Guest session GET | 12,000 |
| Order/service POST | 6,000 |
| Health GET | 120 |
| Other API traffic | 1,200 |
| Session creation IP envelope | 1,200 |

Session creation additionally uses shared PostgreSQL limits: 300/minute per restaurant+IP for new browsers, or 30/minute per authenticated existing guest+restaurant. A merely syntactically valid or fabricated cookie does not qualify as an authenticated guest. Orders retain 20 attempts/minute per authenticated session and service requests retain 10/minute per session, including rejected attempts. Auth retains its strict account/IP limits. These are fixed-window limits; a boundary can permit a double-window burst. IP envelopes are process-local and still require perimeter protection in deployment.

Public APIs remain no-store; no caching was introduced before measurement justified it. Images retain their existing static caching. No Redis, new service, or infrastructure dependency was added.

## Reproduction and instrumentation

- `npm run test:stress`: isolated single-hotel bursts at concurrency 10/25/50/100, 600 normal orders, duplicate replay, pricing, quota and connected socket checks.
- `npm run test:stress:platform`: 100 isolated hotels, 1,000 guest sessions, two categories per hotel, 300 sockets, 1,000 distributed orders, 1,500 mixed operations, 3,000 shared-IP menu reads, then a 15–30 minute soak. Default 900 seconds; set `SOAK_SECONDS` between 900 and 1800. A failed burst prevents starting the soak.
- Scripts restrict targets to localhost, use unique fixture records, and remove their business fixtures in `finally`. They also remove only their fixture-specific throttle rows. Interrupted runs can be recovered with `scripts/cleanup-interrupted-stress.ts` after explicitly confirming the load processes have stopped; it checks the saved manifest and permits only matching local test fixtures. Run `scripts/verify-stress-cleanup.ts` afterward. Do not terminate the processes forcibly if cleanup is required.
- `ORDER_DIAGNOSTICS=1` enables structured transaction timings and five-second runtime samples. Transaction failures always record safe codes, stage, request ID, restaurant ID and attempt; no bearer tokens, raw SQL, customer inputs or payment details are logged.
- Acquisition timing measures transaction API invocation to callback entry, including connection acquisition and BEGIN round-trip. Commit timing is callback completion to transaction promise completion, including protocol/engine overhead; neither claims to be pure server execution time.
- Runtime samples include process memory/CPU, event-loop p99, sockets, and `pg_stat_activity` state/wait counts. Counts cover all clients connected to the database, including the one-connection observer and test clients; they are not exclusively application-pool connections. Prisma reports the actual pool maximum at startup. Order `pendingStarts` and `active` gauges measure application transaction acquisition backlog and in-flight transactions; Prisma's internal query queue length is not directly exposed. The deprecated metrics preview is not enabled; the repository's Prisma version is outside the compatibility range stated in the [official metrics documentation](https://www.prisma.io/docs/orm/v6/prisma-client/observability-and-logging/metrics).

Tests intentionally fail on unexpected HTTP statuses, missing/duplicate orders, wrong totals, wrong numbering or missing/duplicate connected owner events. These tests do not promise durable exactly-once event delivery across a process crash between commit and socket emission. Reconnection recovers state through the existing authenticated REST endpoints. A durable outbox is a separate future requirement, not added for this task.

Local development runs are not production capacity certification. Repeat bursts, distributed/shared-IP loads, socket recovery, year-boundary checks and soak on the intended staging VPS with ingress, TLS and production build before sizing or launch claims.
