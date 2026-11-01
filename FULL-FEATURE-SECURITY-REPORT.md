# Master Technical, Security, and Readiness Audit Report

This report provides a comprehensive, evidence-based audit of the TableBabu repository, documenting implemented features, architecture, security controls, operational readiness, and known limitations.

---

## 1. Executive Summary

### Product
TableBabu is a multi-tenant QR menu and self-ordering SaaS application for restaurants and hotels. Customers scan a single QR code per restaurant, view the menu, place orders, track preparation status, and request their bill (selecting Cash or UPI). Orders and billing are managed by the restaurant owner via a real-time dashboard. The platform supports a subscription model managed by platform administrators.

### Security
The application implements strong authentication using SHA-256 hashed 256-bit opaque tokens, bcrypt (cost 12) for passwords, and production-grade cookie attributes (`HttpOnly`, `SameSite=Lax`, `__Host-` prefix). Authorization is tenant-aware via composite primary keys and runtime restaurant ID checks. Ordering leverages read-committed PostgreSQL transactions with pessimistic row locks (`FOR UPDATE` / `FOR SHARE`) to guarantee integrity against concurrent race conditions, spoofed client pricing, and duplicate idempotency keys.

### Reliability
Database concurrency controls strictly enforce idempotency and order transaction integrity. Real-time WebSocket events act as a low-latency acceleration layer, with robust recovery mechanisms (polling and reconnects) against message loss.

### Current Readiness
**Production-ready with conditions.** The application is functionally and architecturally capable of a controlled production rollout, provided the underlying deployment infrastructure (HTTPS, PostgreSQL, firewalls, and data backup) is properly established and configured as outlined in this report.

---

## 2. Product Overview

The application supports three primary workflows:
1. **Guest/Customer:** QR menu access, cart management, ordering, real-time status tracking, bill requests, payment mode selection, and receipt download.
2. **Owner/Restaurant:** Dashboard management, live order queue, bill confirmations, menu updates, and basic analytics.
3. **Platform Admin/Staff:** Subscription management, restaurant freezing, and employee role assignments via a hidden `/control-room`.

---

## 3. Feature Inventory

| Feature | User role | Status | Implementation evidence | Tests | Notes |
|---|---|---|---|---|---|
| QR generation | Owner | Implemented | `src/server/api.ts`, `qrcode` usage | Not explicitly verified in E2E | Permanent URL encoded |
| Restaurant branding | Owner | Implemented | `schema.prisma` (logoUrl, bannerUrl, accentColor) | `journey.spec.ts` | Stored via `multer` |
| Digital menu & categories | Customer | Implemented | `src/server/api.ts` GET `/public/restaurants/:slug/menu` | `journey.spec.ts` | Validated by API |
| Cart & quantity controls | Customer | Implemented | `src/components/customer.tsx` | E2E browser tests | Local state |
| Customer name & session | Customer | Implemented | `schema.prisma` (OrderSession), `api.ts` POST `/public/sessions` | `journey.spec.ts` | 24-hour expiry |
| Order placement | Customer | Implemented | `src/server/order-placement.ts` | `ordering-races.spec.ts` | Transactional |
| Order tracking (real-time) | Customer | Implemented | `server.ts` (socket rooms) | `ordering-races.spec.ts` | Fallback polling exists |
| Bill request & Payment Mode | Customer | Implemented | `src/server/api.ts` POST `/public/service-requests` | `journey.spec.ts` | Cash or UPI |
| Digital receipt download | Customer | Implemented | `src/server/receipt.ts` | `receipt.test.ts` | HTML format |
| Live incoming orders | Owner | Implemented | `src/server/api.ts`, `dashboard.tsx` | `journey.spec.ts` | Received via WebSockets |
| Bill confirmation (Mark Paid) | Owner | Implemented | `src/server/api.ts` POST `/sessions/:id/paid` | `journey.spec.ts` | Manual verification |
| Analytics & transactions | Owner | Implemented | `src/server/payment-analytics.ts`, `transaction-report.ts` | `transaction-report.test.ts` | Exports PDF, 1/7/30 days |
| Restaurant onboarding | Owner | Implemented | `src/server/onboarding.ts` | `onboarding.test.ts` | Guided drafts |
| Subscription management | Admin | Implemented | `src/server/platform.ts` | `subscription.test.ts` | Freeze/Unfreeze, Starts/Ends |
| Staff management | Admin | Implemented | `src/server/employees.ts` | `employees.spec.ts` | Custom roles |

---

## 4. User Roles and Permissions

The application supports three database `Role` enums: `OWNER`, `ADMIN`, and `STAFF`.

| Capability | Customer | Owner | Employee/Staff (Platform) | Admin (Platform) |
|---|---|---|---|---|
| Menu Access & Ordering | Yes | No | No | No |
| Order & Menu Management | No | Yes | No | No |
| Bill & Payment Confirmation | No | Yes | No | No |
| Restaurant Onboarding | No | Yes | No | No |
| Subscription Freeze/Unfreeze | No | No | Varies (by `PlatformRole`) | Yes |
| Record Subscription Payments | No | No | Varies (by `PlatformRole`) | Yes |
| Manage Platform Roles & Employees | No | No | No | Yes |

*Tenant checks are enforced at the API layer using the authenticated user's assigned restaurants.*

---

## 5. Customer Journey

1. **QR Scan & Session:** Customer scans the QR code, hitting `/r/[slug]`. They enter their name, and POST `/api/public/sessions` issues a 24-hour HttpOnly `guest-[slug]` cookie.
2. **Browsing:** Customer browses the menu (`/api/public/restaurants/[slug]/menu`).
3. **Cart & Order:** Customer adds items to cart and submits via POST `/api/public/orders`.
4. **Tracking:** WebSockets (`session:[id]` room) provide real-time updates (Accepted, Preparing, Served).
5. **Bill Request:** Customer selects Cash or UPI, hitting POST `/api/public/service-requests`.
6. **Payment & Receipt:** Owner marks it paid. The customer UI unlocks receipt download, calling GET `/api/sessions/current`.

---

## 6. Owner Journey

1. **Login:** Authenticates via POST `/api/auth/login`. Receives `__Host-admin` cookie.
2. **Dashboard:** Connects to WebSocket room `admin:[restaurantId]`.
3. **Daily Operation:** Receives `order:new`. Updates status to `ACCEPTED` -> `PREPARING` -> `COMPLETED`.
4. **Billing:** Sees bill requests, confirms payment physically or via UPI app, and clicks "Mark Paid" (POST `/api/sessions/[id]/paid`).
5. **Management:** Updates menu categories and items via `PATCH /api/menu/items/[id]`.

---

## 7. Staff/Kitchen Journey

Not implemented as distinct application roles. The kitchen and serving staff workflows are entirely managed through the unified Owner dashboard.

---

## 8. Platform Admin Journey

1. **Provisioning:** Initial admin created via CLI (`npm run admin:create`).
2. **Login:** Accesses `/control-room`.
3. **Management:** Views all restaurants. Can freeze/unfreeze accounts (`PATCH /api/platform/restaurants/[id]/freeze`) and record subscription payments (`POST /api/platform/restaurants/[id]/payments`).
4. **Employees:** Creates platform staff and assigns custom permissions (`POST /api/platform/employees`).

---

## 9. System Architecture

- **Runtime:** Node.js (v24+) running Next.js custom server (App Router + Express APIs + Socket.IO) in a single process.
- **Database:** PostgreSQL accessed via Prisma ORM.
- **State:** No external caching (e.g., Redis). WebSockets and rate limits are process-local.
- **Frontend:** React 19, Tailwind CSS 4, built with Vite/Next.

---

## 10. Database Architecture

Primary tables and their relationships:
- **User / AuthSession:** Manages platform and owner identities and hashed session tokens.
- **Restaurant:** Core tenant entity. Has composite relations to categories, items, and sessions.
- **OrderSession:** Guest identity. Primary Key `id`. Unique constraint on `sessionToken`.
- **Order:** Tracks orders. Composite unique constraint `[restaurantId, orderYear, orderCounter]`.
- **OrderItem:** Snapshots item names and prices at the time of order.
- **RestaurantOrderCounter:** Atomic counter per restaurant per year. Primary Key `[restaurantId, year]`.
- **PlatformRole / EmployeeRestaurantAccess:** Maps platform employees to authorized restaurants.

*Tenant isolation is enforced via `restaurantId` foreign keys on all operational data.*

---

## 11. Multi-Tenant Isolation

Strongly enforced via API design and database constraints.
- **Authentication:** `X-Restaurant-Id` header is validated against the authenticated user's `restaurants` or `restaurantAccess` array.
- **Data Scoping:** Every database query in `src/server/api.ts` inherently includes `where: { restaurantId: req.restaurantId }`.
- **BOLA/IDOR Protection:** Attempting to alter a URL or payload `id` belonging to another restaurant results in a 404 (due to the `restaurantId` filter clause).
- **WebSockets:** Room isolation (`admin:[restaurantId]`, `menu:[restaurantId]`) prevents cross-tenant data leakage.

---

## 12. Order Identity and Numbering

- **Format:** `HOTEL:YEAR:COUNTER` (e.g., `AMAN:2026:000001`).
- **Generation:** Handled inside `src/server/order-placement.ts` via `allocateOrderCounter`.
- **Database Enforcement:** `INSERT ... ON CONFLICT ("restaurantId", "year") DO UPDATE ... RETURNING "currentCounter"`.
- **Uniqueness:** Guaranteed by Prisma unique constraint `@@unique([restaurantId, orderYear, orderCounter])` on the `Order` model.
- **Rollback:** Counter allocation and order creation share a database transaction. If the transaction rolls back, the counter increments are preserved in PostgreSQL, meaning gaps are possible (not a continuous sequence guarantee), but uniqueness is absolute.

---

## 13. Authentication

- **Implementation:** Custom session management (no third-party auth providers).
- **Tokens:** High-entropy (256-bit) opaque tokens (`crypto.randomBytes(32)`).
- **Storage:** Stored in DB as SHA-256 hashes (`tokenHash`).
- **Cookies:** `HttpOnly`, `SameSite=Lax`. In production, uses `Secure` and `__Host-` prefixes (`__Host-admin`, `__Host-guest-[slug]`).
- **Expiry:** Absolute expiry (12 hours for owners, 24 hours for guests). Handled server-side.

---

## 14. Password Security

- **Algorithm:** bcrypt (cost factor 12) via `bcryptjs`.
- **Policy:** Minimum 12 characters enforced by Zod (`passwordSchema`).
- **Changes:** Updating a password immediately revokes all active sessions for the user (`login-activity.ts` and `api.ts`), requiring re-authentication.

---

## 15. Session Security

- **Rotation:** Successful logins rotate existing sessions.
- **Revocation:** Explicit logout deletes the session row from PostgreSQL and terminates connected WebSockets.
- **Fixation:** Prevented by issuing a new opaque token on login.

---

## 16. Authorization

Enforced via Express middleware (`src/server/security.ts`):
- `signedIn`: Requires valid user session.
- `admin`: Requires user session and verifies `X-Restaurant-Id` ownership.
- `platformAdmin`: Requires `ADMIN` role.
- `platformAccess`: Resolves permissions for `STAFF` and `ADMIN` based on `PlatformRole`.

---

## 17. Customer Session Security

- **Establishment:** Customers must supply a name to receive a `guest-[slug]` session cookie.
- **Isolation:** The cookie is bound to the specific restaurant slug.
- **Authorization:** `customer(req, slug)` validates the session hash against the database and confirms `expiresAt` and closed state. Customers cannot access bills of other sessions.

---

## 18. Input Validation

- **Library:** Zod (`zod`).
- **Usage:** Extensive schemas defined in `src/server/domain.ts` (e.g., `itemSchema`, `orderSchema`, `settingsSchema`).
- **Protection:** Prevents malformed JSON, extremely long strings, and missing fields. Uploads are strictly validated, resized, and re-encoded via `sharp` and `multer`.

---

## 19. Ordering Integrity

Extremely rigorous design implemented in `src/server/order-placement.ts`:
- **Session Lock:** `SELECT ... FOR UPDATE` locks the customer's session, preventing concurrent checkout or settlement races.
- **Item Validation:** Menu items and categories are checked for availability and active status using `SELECT ... FOR SHARE`.
- **Snapshots:** Names and prices are snapshotted into `OrderItem` to permanently sever them from future menu edits.
- **Transaction:** Runs inside a `ReadCommitted` Prisma transaction.

---

## 20. Pricing Integrity

Client-submitted prices are entirely ignored. `placeOrder` fetches prices directly from the `MenuItem` database row using the provided IDs, calculates the total mathematically using `Prisma.Decimal`, and assigns it to the `Order`.

---

## 21. Idempotency

- **Mechanism:** Clients generate an `idempotencyKey` per order attempt.
- **Enforcement:** `@@unique([orderSessionId, idempotencyKey])` in `schema.prisma`.
- **Behavior:** If a duplicate key is submitted, the transaction checks `Order` and safely returns the original 201 response (and order payload) without duplicating the order or billing.

---

## 22. Transaction and Concurrency Architecture

- **Isolation:** Changed from `Serializable` to `ReadCommitted` to prevent overwhelming 40001 serialization errors.
- **Locks:** Leverages explicit row-level locks (`FOR UPDATE`, `FOR SHARE`) via raw SQL to maintain invariants.
- **Retries:** Implements an automatic jittered retry loop (up to 2 times) for transient database conflicts. Max acquisition wait is 10,000ms.

---

## 23. Billing and Payment Workflow

- **Customer Action:** Submits bill request via `/public/service-requests` with type `REQUEST_BILL`. Selects Cash or UPI.
- **Owner Action:** Dashboard flags the session. Owner physically verifies the payment.
- **Settlement:** Owner clicks "Mark Paid" (POST `/sessions/:id/paid`).
- **Boundary:** **There is no payment gateway integration.** The app purely tracks whether the owner acknowledged receipt of funds.

---

## 24. Digital Receipts

- **Format:** Generated dynamically as HTML using `renderReceipt` (`src/server/receipt.ts`).
- **Security:** Fully HTML-escaped to prevent XSS.
- **Status:** **This is an informal digital receipt, not a GST-compliant tax invoice.**

---

## 25. Realtime/WebSockets

- **Engine:** Socket.IO.
- **Authentication:** Validates cookies during handshake (`socket.handshake.auth`).
- **Isolation:** Clients forcefully joined to scoped rooms (`admin:[id]`, `session:[id]`).
- **Reliability:** Delivery is best-effort exactly-once while connected. Clients actively poll the REST API to reconcile missed events.

---

## 26. Rate Limiting

Implemented via `express-rate-limit` (`src/server/traffic-limits.ts`):
- **Menu/Public GET:** 12,000 requests/min.
- **Order POST:** 6,000 requests/min.
- **Session Creation:** 300/min per IP (or 30/min per authenticated session) tracked via database `SecurityThrottle`.
- **Limitation:** With the exception of the DB-backed session limit, rate limits are process-local memory counters, not distributed.

---

## 27. Security Headers/CORS/TLS

- **Headers:** Managed by `helmet`.
- **CSP:** Strict Content-Security-Policy using cryptographic nonces for scripts. No `unsafe-eval`.
- **CORS:** Socket CORS strictly validates the `Origin` header.
- **TLS:** Assumes TLS termination at the reverse proxy (`TRUST_PROXY` aware).

---

## 28. XSS/CSRF/SQL Injection Review

- **XSS:** React auto-escapes UI rendering. Receipts are strictly escaped. Uploads are strictly re-encoded images (stripping malicious EXIF or disguised SVGs).
- **CSRF:** Authenticated APIs strictly enforce the `Origin` header. Fetch metadata is checked. Cookies are `SameSite=Lax`.
- **SQLi:** Prisma parameterized queries used universally. The few raw queries use Prisma's safe `$queryRaw\`` tagged template literal.

---

## 29. Personal Data and Privacy

- **Collection:** Collects customer name provided during order. Collects owner email and name.
- **Retention:** Session records remain in the database. Employee login history is tracked indefinitely in `LoginActivity`.
- **Deletion:** No automated PII purging or retention chron jobs exist in the codebase.

---

## 30. Analytics and Reporting

- **Metrics:** Sales, orders, and payment method summaries calculated server-side in the restaurant's IST timezone.
- **Exports:** PDF transaction exports available (1, 7, 14, 30 days). Tenant scoped.

---

## 31. Subscription/Recharge/Account Lifecycle

- **State:** Restaurants can be active or `platformFrozen`.
- **Dates:** `subscriptionStartsAt` and `subscriptionEndsAt` enforce billing cycles.
- **Mechanisms:** All checks are robustly verified inside `placeOrder` transactions. Payments are manually recorded by Platform Admins; no automated Stripe/Razorpay logic exists.

---

## 32. QR Security

- **Format:** QR codes encode standard URLs mapping to the public `slug`.
- **Risk:** QR acts purely as routing context, not an authentication token. Guests still establish secure sessions on their device.

---

## 33. Employee Security

- **Controls:** Platform staff are granted targeted permissions (`restaurants:view`, `payments:write`).
- **Revocation:** Disabling an employee or changing their password instantly revokes their `AuthSession`.

---

## 34. Admin Security

- High-risk operations (freezing, role modification) are protected by `platformAdmin` guards and optimistic versioning checks (`subscriptionVersion`) to prevent concurrent overwrite races.

---

## 35. Logging and Error Handling

- **Error Format:** Production APIs do not leak stack traces or SQL errors.
- **Auditing:** State changes and failures generate structured JSON stdout logs for ingest by external log aggregators.
- **PlatformAction / EmployeeAudit:** Administrative changes are durably logged to the database.

---

## 36. Dependency Security

- `npm audit --omit=dev` executed on 2026-10-07 returned **0 vulnerabilities**.

---

## 37. Performance and Stress-Test Evidence

- **Evidence:** Documented in `ORDERING-CONCURRENCY.md`.
- **Results:** 925 serializable failures previously reported have been eliminated using pessimistic row locking. Local stress tests confirm atomic counters and idempotency function correctly under load (e.g., 100 concurrent requests).

---

## 38. Threat Model

| Threat | Attack path | Existing mitigation | Residual risk |
|---|---|---|---|
| Malicious Customer | Spoofs `price` in POST payload | Prices fetched strictly from `MenuItem` DB | Low |
| Race Condition | Submits identical order multiple times concurrently | Session locks + idempotency keys | Low |
| Tenant IDOR | Changes `id` in API requests to target another restaurant | `restaurantId` scoping attached to auth context | Low |
| Admin Account Compromise | Attacker manages to steal platform admin session | `__Host-admin` cookies, session expiry | Medium (Needs 2FA/MFA) |
| DOS Attack | Exhausts Node.js event loop with heavy traffic | `express-rate-limit` process boundaries | Medium (Needs external CDN/WAF) |

---

## 39. OWASP Review

- **Broken Access Control:** Protected via tenant scoping.
- **Injection:** Protected via Prisma.
- **Insecure Design:** Idempotency and transactional integrity are strongly designed.
- **Security Misconfiguration:** Requires careful `.env` setup in production.
- **Broken Auth:** Opaque hashed tokens are robust.

---

## 40. Verified Security Strengths

- Robust order transactional integrity with optimistic/pessimistic locking.
- Absolute prevention of client-side price spoofing.
- Authoritative session revocation on password change.
- Strict CSP nonces preventing inline XSS.

---

## 41. Security Findings

| ID | Severity | Finding | Evidence | Exploit scenario | Recommendation |
|---|---|---|---|---|---|
| SEC-01 | Low | Process-local IP limits | `traffic-limits.ts` | Attackers spanning multiple IPs or overwhelming a single process. | Deploy WAF/CDN in front of Node.js. |
| SEC-02 | Low | Lack of MFA | `security.ts` | Admin password compromised. | Implement TOTP or email verification. |
| SEC-03 | Info | PII Retention | `schema.prisma` | DB grows unbounded with old sessions. | Implement a data retention purge cron. |

---

## 42. Risk Register

| Risk | Probability | Impact | Current mitigation | Recommended next action |
|---|---|---|---|---|
| Manual Payment Discrepancies | Medium | High | Staff verify payment | Train staff carefully on UI |
| Node.js Process Crash | Low | Medium | Restart via PM2/Docker | Run multiple replicas with sticky sockets |

---

## 43. Production Deployment Requirements

- [x] HTTPS / TLS termination
- [x] Secure `__Host-` cookies
- [x] PostgreSQL database
- [ ] Database backup and restore testing
- [ ] WAF / Perimeter rate limiting
- [ ] Log aggregation for stdout JSON

---

## 44. Backup and Disaster Recovery

Currently **not verified from the current repository.** No automated backup scripts exist in the repository; this must be managed by the deployment infrastructure (e.g., AWS RDS automated backups).

---

## 45. Production Readiness Scorecard

- Functional completeness: **Strong**
- Data integrity: **Strong**
- Authentication: **Strong**
- Authorization / Tenant isolation: **Strong**
- Ordering concurrency: **Strong**
- Rate limiting: **Acceptable** (Process-local)
- Realtime reliability: **Acceptable** (Best-effort + Polling)
- Backup/recovery: **Needs work** (Requires infrastructure)
- Deployment hardening: **Acceptable** (Requires reverse proxy)

---

## 46. Recommended Next Actions

**Before first paid pilot:**
- Setup automated PostgreSQL backups.
- Deploy behind a reverse proxy (Nginx/Caddy) with HTTPS to enable `Secure` cookies.

**Before 100+ restaurants:**
- Implement distributed rate limiting (e.g., Redis).
- Establish formal data retention and automated pruning logic for `OrderSession` and `LoginActivity`.

---

## 47. Known Limitations

- **No Payment Gateway:** All payment collections (Cash/UPI) rely entirely on manual physical verification by the owner.
- **Process-local limits:** Node.js rate-limiting logic is not shared across multiple processes.
- **Digital Receipts:** Receipts generated are informational and not GST-compliant tax invoices.
- **No MFA:** Platform and Owner accounts lack multi-factor authentication.

---

## 48. Repository Evidence Appendix

- **Schema & Architecture:** `prisma/schema.prisma`
- **Ordering Transaction:** `src/server/order-placement.ts` (Lines 45-250)
- **Authentication & Authorization:** `src/server/security.ts`, `src/server/access.ts`
- **Rate Limits:** `src/server/traffic-limits.ts`
- **WebSocket Security:** `server.ts` (Lines 69-99)
- **Documentation:** `ORDERING-CONCURRENCY.md`, `SECURITY.md`

---

## 49. Test Evidence Appendix

- **E2E Ordering Races:** `tests/e2e/ordering-races.spec.ts` (Validates order commit, rollback, and idempotency).
- **Core Business Logic:** `domain.test.ts`, `receipt.test.ts`.
- **Integration Tests:** `onboarding.test.ts`, `traffic-limits.test.ts`, `subscription.test.ts`, `transaction-report.test.ts`.

---

## 50. Final Technical Assessment

### What is already strong?
The core ordering architecture, data integrity, tenant isolation, and transactional race-condition prevention are extremely robust.

### What is acceptable for an initial controlled restaurant pilot?
The application can be deployed as-is on a single robust VPS for a small pilot, assuming basic TLS, WAF, and database backup infrastructure is provided.

### What must be completed before production rollout?
Establish a trusted reverse proxy configuration, set up monitoring/log aggregation, and verify database backup restoration.

### What should intentionally NOT be built yet?
Do not introduce Kubernetes, Redis, or Microservices. The current monolithic Node + Postgres architecture is highly optimized and perfectly sufficient.

### What are the top five remaining technical/security risks?
1. Relying on process-local IP limits.
2. The absence of automated payment gateway verification.
3. Missing MFA for high-privilege platform admin accounts.
4. Untested production disaster-recovery workflow.
5. Indefinite retention of PII and order metadata without pruning.

## Subscription QR feature update ? 7 October 2026

The admin restaurant editor now has **Upload QR** and **Lock QR** sections. Uploaded payment QR images and generated UPI QRs are locked on save. Only platform ADMIN accounts can unlock, replace, remove or lock them; platform employees remain read-only regardless of their historical `qr:manage` permission. Restaurant owners can view and download their assigned QR.

Images are decoded/re-encoded as PNG, size/pixel limited, and stored in private `SubscriptionQrImage` rows. Authenticated endpoints enforce ownership or platform viewing scope. Writes revalidate admin authorization and optimistic versions transactionally; upload/lock changes are audited. Existing assigned QRs are locked by migration `20261007140000_subscription_qr_lock`. See `SECURITY.md` and `tests/e2e/subscription-qr.spec.ts` for the specific controls and regression coverage. This addendum does not re-certify the broader readiness claims elsewhere in this report.
