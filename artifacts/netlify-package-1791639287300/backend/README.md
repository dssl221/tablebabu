# TableBabu

A restaurant QR menu and self-ordering system. One QR per restaurant; customers enter a name, order, follow preparation, and pay at the counter. No customer accounts, table numbers, delivery, or online payment.

## Run locally

### Public homepage

`/` is the public TableBabu landing page. Signup and sign-in continue at `/signup` and `/login`; the owner workspace remains `/dashboard`. The homepage uses a server-rendered layout with responsive navigation, keyboard-accessible product tabs, native expandable FAQs, and locally hosted WebP captures of the real interface with illustrative data. Restaurant, cafe and hotel sections lead into the existing signup flow; no external tracking or placeholder lead forms are added. Screenshot sources are recorded in `public/images/product/README.md`. Only the public homepage opts into search indexing; protected app pages retain their existing no-index metadata.

Animated feature cards explain QR menus, live orders, counter payments and reporting. Cards reveal once as they enter the viewport, with subtle hover feedback. Reduced-motion preferences disable animation; all content remains readable without JavaScript. There is no video player or browser narration.

### India privacy and legal pages

Policies and the grievance form are under `/legal/privacy`, `/legal/terms`, `/legal/refunds`, `/legal/cookies` and `/legal/contact`. Platform administrators process requests at `/control-room/privacy`. New owners explicitly accept versioned terms; old accounts are not silently marked as having accepted. Run the additive migration before startup. See [INDIA-COMPLIANCE.md](INDIA-COMPLIANCE.md) for implementation limits, request handling, retention, incident response and required legal/operational review. The change is not a compliance certificate or government approval.

### Sitemap endpoints

`/sitemap.xml` lists the homepage, currently the only indexable marketing page. `/robots.txt` advertises the sitemap, and the homepage has a matching canonical URL. All URLs use the configured `APP_ORIGIN`; set it to the public HTTPS domain before deployment. Login, signup, dashboard, control room, onboarding and guest ordering routes remain excluded and retain their existing noindex metadata. Add future indexable marketing pages to `src/app/sitemap.ts`. No database records or customer sessions are enumerated. After deployment, submit `/sitemap.xml` in your domain's Google Search Console property.

### Platform employees and IST


In `/control-room`, choose **Employees & roles** (platform administrators only):

- **Employees:** create a staff login with a new email and a password of at least 12 characters, assign a role, and choose specific restaurants or all current/future restaurants. New employees default to Viewer with no assigned restaurants. An empty assignment means no restaurant visibility. Edit access to disable/re-enable an account, change its role or assignments, or reset its password. Saving an existing employee signs out all its sessions. Existing owners/administrators cannot be converted through these APIs.
- **Roles:** Viewer, Support, and Billing are provided initially. Create or edit roles with separate permissions for restaurant viewing, freezing/unfreezing, payment QR viewing (changes remain admin-only), payment-history viewing, and recording subscription payments. Recording payment does not grant unfreeze permission. Changing a role signs out everyone assigned to it. Employee management itself cannot be delegated through these role checkboxes.
- **Login history:** shows employee login, explicit logout or other session end, duration, and end reason in IST. Filter a date range (up to one year) and optionally one employee. Results include sessions overlapping the chosen IST dates and are paginated. A valid session is shown as ?Signed in?; this does not mean the person is online or working. Closing a tab is not logout. Expiry, role/access changes, disabling, password changes/resets, and login rotation are labelled separately. History begins when this feature is installed; no earlier activity is fabricated.

The Node server and PostgreSQL database default use **UTC**. All restaurant opening hours, analytics day/hour boundaries, subscription calendars, new receipts/PDFs, and platform activity displays use **IST (`Asia/Kolkata`, UTC+05:30)**. API timestamps remain ISO-8601 UTC values ending in `Z`. Existing timestamps and previously issued receipt snapshots are not rewritten. Restaurant timezone settings are now fixed to IST, including existing onboarding drafts.

Run `npm run db:migrate` with the database-owner migration account: the new migration sets the database timezone to UTC. Restart all application workers/pools afterwards because the database default applies to new connections. The runtime database account does not need permission to change database settings. Stored login sessions and employee-change audit records need a production retention policy and restricted database access; there is no automatic history deletion in this release.

### Platform administrator and restaurant subscriptions

The unlisted platform dashboard is **`/control-room`**. The page accepts platform `ADMIN` and `STAFF` accounts. Every API enforces role permissions and employee restaurant visibility; only `ADMIN` accounts can manage employees and roles. Ordinary owners receive no platform access, even with a forged restaurant header or a direct URL. Public registration always creates owners.

To provision your first platform administrator, supply `PLATFORM_ADMIN_NAME`, `PLATFORM_ADMIN_EMAIL`, and a unique `PLATFORM_ADMIN_PASSWORD` through your local environment or `.env`, then run `npm run admin:create`. Use a new email address; this command does not promote existing owner accounts. Remove the provisioning password afterwards. Sign in through `/login`; an administrator is redirected to `/control-room`. No default administrator or shared password is created.

The dashboard lists all registered restaurants, owner contacts, subscription status, and remaining days, with search and pagination. **Manage restaurant** provides:

- **Access:** freeze new online orders with a reason shown privately to the owner, or unfreeze. Existing orders, bills, receipts, and owner access remain available. Unfreezing does not extend expired dates.
- **Payment QR:** open a restaurant, choose **payment QR**, then **Upload QR** (PNG/JPEG/WebP, up to 5 MB and 4 megapixels) or generate from UPI details. Saving locks the QR automatically. The **Lock QR** section lets only a platform administrator unlock it before replacement/removal, or lock it again. Owners can view/download their assigned QR; employees with the QR permission have read-only access, including when unlocked. Uploads are privately stored in PostgreSQL, re-encoded as PNG, and served through authenticated endpoints. Verify the recipient using your UPI app before sharing.
- **Record payment:** manually verify receipt, enter the received INR amount and a unique transaction/receipt reference, and choose the subscription start and last valid date. Dates use IST; the last date remains valid until 23:59:59.999 IST. The browser converts those boundaries to UTC instants before submitting. Saving replaces the previous subscription dates and optionally unfreezes the restaurant. It does not override the owner's paused kitchen/opening hours.
- **History:** inspect the latest 20 subscription payments and latest 20 admin actions. Records are retained in the database. Subscription payments are separate from customer order revenue.

Expiry and future start dates are checked by the backend on every new order, including already-open menus. Existing restaurants have **Not configured** subscriptions and continue working until explicitly configured or frozen; there is no automatic trial or surprise lockout. Day counts round remaining partial days up to one day and never go below zero. Owner panels update through dashboard refresh/realtime invalidation and a 30-second fallback poll. No UPI gateway verification or automatic activation is implied by displaying or scanning a QR.

The additive `20261006010000_platform_subscriptions` migration adds subscription fields, payment records, and admin action records. Run `npm run db:migrate` before deploying this version. Writes use optimistic version checks and serializable transactions; payment retries use idempotency keys, and a payment reference cannot be recorded twice for the same restaurant.

Security controls, deployment requirements, and remaining identity/operational limitations are documented in [SECURITY.md](SECURITY.md). Run the new additive database migration before starting this version. Account settings now supports password changes with revocation of all signed-in devices.

Customer tracking and the restaurant dashboard use **Received → Preparing → Completed**. Staff select **Start preparing**, then **Complete order**. Historical accepted orders appear under Received; ready/served orders appear under Preparing until completed. Cancelled orders remain visible in All orders. Completing an order does not mark its bill paid.

Requirements: Node.js 24+, npm, and PostgreSQL. The optional local database helper starts real PostgreSQL on loopback; Docker is not required.

```sh
npm ci
cp .env.example .env
```

Configure `DATABASE_URL`, `APP_ORIGIN`, `SEED_EMAIL`, and a unique `SEED_PASSWORD` of at least 12 characters. Never use the local demonstration password in production.

In a separate terminal, start your local database:

```sh
npm run db:local
```

Or use an existing PostgreSQL database. `docker compose up -d` is another option after setting `POSTGRES_PASSWORD`; update `DATABASE_URL` accordingly. For npm versions that block package install scripts, review and allow the `@embedded-postgres/<your-platform>` hydration script before running the optional helper.

```sh
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

- Owner workspace: http://localhost:3000/dashboard
- New restaurant onboarding: http://localhost:3000/signup
- Customer menu: http://localhost:3000/r/bengal-bistro
- Sign in with your configured seed credentials.

The seed contains a branded restaurant and ten sample dishes, with no artificial orders or revenue. Order IDs use **HOTELCODE:YEAR:000001**, with an independent counter for each hotel and IST calendar year. Kitchen hours default to 11:00–23:00 Asia/Kolkata. Equal opening and closing times mean 24-hour service, useful for local testing.

Customer sessions last 24 hours and survive refreshes and tab closures using an HttpOnly cookie. Cart contents persist locally per session. After payment is recorded (or the session is closed), customers can scan the same QR or choose **Start a new visit** to order again. The old bill remains intact for staff to close separately. Unpaid active visits continue using their existing session, and different browsers receive independent sessions. Duplicate customer names are allowed.

When requesting a bill, customers choose **UPI** or **Cash**. The choice appears live in Customers & bills and the bill detail. It records the intended payment method; it does not initiate a UPI transfer or confirm payment automatically. Staff confirms receipt at the counter using **Mark paid**. This saves a receipt snapshot and unlocks **Download receipt** on the customer's order screen. The download is a standalone HTML receipt that can be printed or saved as PDF from the browser. It excludes cancelled orders and uses historical item prices. Download before starting a new visit; receipt access requires the current visit's unexpired HttpOnly cookie. Older paid visits without a stored snapshot use their historical orders and current restaurant details when first downloaded. This is a payment receipt, not a GST tax invoice.

## Architecture

One Node process serves Next.js App Router pages, Express APIs, and authenticated Socket.IO rooms. PostgreSQL is the source of truth; Prisma manages queries and migrations. Tailwind CSS 4 plus a small design system styles the mobile menu and owner workspace.

- `prisma/schema.prisma`: models, composite tenant foreign keys, indexes, money decimals, unique order numbers and idempotency constraints.
- `src/server/api.ts`: public and authenticated API routes.
- `src/server/security.ts`: cookie authentication, tenant resolution, token hashing, authorization.
- `src/server/domain.ts`: name validation, opening hours, order transition rules, Zod schemas.
- `server.ts`: Next/Express/Socket.IO integration and security headers.
- `src/components/customer.tsx`: welcome, menu, cart, order tracking, bill request.
- `src/components/dashboard.tsx`: overview, live orders, customer bills and analytics.
- `src/components/management.tsx`: categories, dishes, branding, image upload and QR printing.

Admin routes derive the restaurant from the authenticated owner, never from client-provided object IDs. Every menu/order/session query is tenant-scoped. Composite foreign keys prevent categories and sessions from being attached to another restaurant. `X-Restaurant-Id`, when supplied to an API, is checked against ownership. The MVP workspace operates one restaurant per owner; separate owners can run independent restaurants in the same database.

Order placement uses read-committed transactions with targeted session/menu/settings locks and bounded conflict retries. Database prices and names are snapshotted into order items. A dedicated atomic PostgreSQL restaurant/year counter and database constraints generate unique HOTEL:YEAR:COUNTER identities. The same session + idempotency key returns the original order; a changed payload with the same key is rejected. Menu edits never change historical totals. Requesting a bill pauses additional ordering. Payment locks all orders in a session; closing requires settlement and no unfinished orders.

Socket room membership is assigned only by the server. Anonymous clients receive menu invalidations, customer cookies authorize their own session room, and owner cookies authorize their restaurant room. Status events contain committed data. Clients reload authoritative state on connection, tab visibility, and every 20 seconds to recover from lost messages or server restarts. Socket.IO is an acceleration layer, not the system of record.

## Important endpoints

| Area              | Endpoints                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Auth              | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`                                       |
| Onboarding        | `GET /api/onboarding`, `GET /api/onboarding/slug?slug=...`, `PATCH /api/onboarding/draft`, `POST /api/onboarding/launch`             |
| Public menu       | `GET /api/public/restaurants/:slug`, `GET /api/public/restaurants/:slug/menu`                                                        |
| Guest session     | `POST /api/public/sessions`, `GET /api/public/sessions/current?slug=…`                                                               |
| Guest orders/help | `POST /api/public/orders`, `POST /api/public/service-requests`                                                                       |
| Menu              | `GET /api/menu`, `POST/PATCH /api/menu/categories[/id]`, `POST/PATCH /api/menu/items[/id]`, `PATCH /api/menu/items/:id/availability` |
| Kitchen           | `GET /api/orders`, `PATCH /api/orders/:id/status`                                                                                    |
| Billing           | `GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/paid`, `POST /api/sessions/:id/close`                          |
| Requests          | `PATCH /api/service-requests/:id`                                                                                                    |
| Settings          | `GET/PATCH /api/restaurant`, `POST /api/uploads`                                                                                     |
| Insights/QR       | `GET /api/analytics?days=1                                                                                                           | 7   | 30`, `GET /api/qr?download=1` |
| Health            | `GET /api/health`                                                                                                                    |

Bearer secrets are deliberately never put into URLs. The requested `/sessions/:token` route accepts `current` and authenticates using the restaurant-specific HttpOnly cookie. Database session tokens are SHA-256 hashes. State-changing API requests must include the exact configured `Origin` header. Browser fetch does this automatically.

Socket events: `order:new`, `order:accepted`, `order:preparing`, `order:ready`, `order:served`, `order:completed`, `order:cancelled`, `service:bill`, `service:help`, `session:updated`, and `menu:updated`.

## New restaurant onboarding

Open `/signup` or choose **Set up your restaurant** on the sign-in page. Create an owner account, then complete four guided steps: restaurant details and URL, branding and opening hours, categories and dishes, and a final preview before publishing. The launch screen provides the permanent QR, menu link, and dashboard access.

Drafts autosave to PostgreSQL. **Save & exit** saves progress and signs out; signing back in resumes the same step. Version checks prevent another tab from silently overwriting a newer draft. Registration retries and publication are idempotent. URL reservations and menu creation run in transactions, and all setup operations are scoped to the authenticated restaurant.

New restaurants stay private with ordering disabled until explicit publication. Launch validates the complete draft and creates the live menu atomically. Existing restaurants remain live after the additive onboarding migration. No customer account or onboarding is required beyond entering a name when ordering.

Self-service registration uses password authentication; email verification, password recovery by email, SSO and MFA are not configured. Connect those services before requiring those capabilities in a rollout.

For operator-managed provisioning instead, set these environment variables through a secure terminal or secret manager:

```text
OWNER_NAME
OWNER_EMAIL
OWNER_PASSWORD
RESTAURANT_NAME
RESTAURANT_SLUG
```

Run `npm run restaurant:create`. This bypasses onboarding and creates a live restaurant. Provisioning is atomic and rejects existing emails/slugs. Owners then sign in, add categories and dishes, set their branding/hours, and download their permanent QR. No multi-branch management is included.

## Verify

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm audit
```

The Playwright suite uses a real PostgreSQL database and isolated, uniquely named test tenants, cleaned up afterwards. It runs Rahul’s full two-browser acceptance journey, checks tenant isolation, server-side pricing, concurrent retries, price history, closed/sold-out behavior, session recovery, mobile overflow, and live menu updates. Screenshots are written to `artifacts/`; failed traces go to `test-results/`.

On Windows, stop running application/test processes before `prisma generate` or `npm run build`, because Prisma’s native DLL cannot be replaced while loaded.

## Deploy

1. Provision PostgreSQL with backups, TLS, a least-privilege application account and a separate migration role where available.
2. Set `DATABASE_URL`, a public HTTPS `APP_ORIGIN` (no trailing slash), `NODE_ENV=production`, and `PORT`. Remove seed/provisioning passwords from the runtime environment after setup.
3. Run `npm ci`, `npm run db:migrate`, and `npm run build` in the release pipeline. Launch with `npm start`.
4. Terminate TLS at a reverse proxy supporting HTTP/1.1 WebSocket upgrades. Preserve `Host` and forward `X-Forwarded-For`. Set `TRUST_PROXY=1` only for exactly one trusted proxy. Do not expose the application port directly when trusting forwarded headers.
5. Persist and back up `uploads/` along with PostgreSQL. Images are limited to 5 MB, decoded, resized and re-encoded to WebP. Original uploads and metadata are discarded.
6. Check `/api/health`, scan the published QR from a real phone, enable dashboard sound with its bell button, and run the acceptance flow before opening service.

The included Dockerfile runs as a non-root user. Build with `docker build -t tablebabu .`; supply runtime environment variables and mount a persistent `/app/uploads` volume. Run migrations separately from the source checkout or a release job; the slim runtime image excludes migration tooling.

This MVP uses **one application instance**, local upload storage, and process-local socket/rate-limit state. Scale vertically first. Multiple application replicas require shared socket fan-out, shared rate limiting, sticky sessions when polling is enabled, and shared upload storage; those dependencies are intentionally not installed. PostgreSQL handles durable multi-tenant data independently.

Sales analytics exclude cancelled orders and use the restaurant’s timezone. “Collected” means sessions marked paid by staff, not payment-gateway receipts or tax-compliant invoices. This is not a POS or accounting system. The UI uses the most recent orders plus active orders; long-term reporting lives in the 1/7/30-day analytics views.

Analytics includes UPI, Cash, and unrecorded payment-method breakdowns: distinct visits, paid/unpaid visit counts, confirmed received amounts, and amounts awaiting payment. Selecting a method does not count as received money. Like the existing sales metrics, the period is based on order dates in the restaurant's timezone, not payment timestamps; totals include only non-cancelled orders within that period. A visit with several orders counts once in its payment-method group.

**Download transactions** in Analytics exports a PDF for 1 week, 2 weeks, 3 weeks, or 1 month (30 days), including today. Unlike order-date charts, exports use the payment confirmation date in the restaurant's timezone. Each row is a paid visit with its customer name, order numbers, method, and total; cancelled orders and unpaid visits are excluded. Reports include UPI/Cash/unrecorded summaries, repeat table headers across pages, and require owner authentication. `GET /api/analytics/transactions.pdf?days=7|14|21|30` is tenant-scoped, limited to six exports per minute per owner, and rejects oversized reports above 10,000 candidate visits rather than silently truncating them. The embedded Noto Sans font license is in `public/fonts/OFL.txt`.

Security measures include bcrypt password hashes, high-entropy opaque tokens, revocable owner sessions, production Secure/HttpOnly/SameSite cookies, explicit origin checks, Zod validation, parameterized Prisma queries, React text escaping, server-derived totals, upload re-encoding, rate limiting, security headers and tenant-scoped socket rooms. Production rollout still needs your hosting, backup/restore verification, operational monitoring and privacy/retention policy.

## Sample photography

Local sample WebP assets are sourced from Unsplash and are illustrative, not photographs of an actual Bengal Bistro. Replace them with the restaurant’s own photographs before commercial launch. Source IDs and credits are recorded in `public/images/CREDITS.md`.

Implementation references: [Next.js custom server](https://nextjs.org/docs/app/guides/custom-server), [Prisma transactions](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions), [Socket.IO CORS and origin handling](https://socket.io/docs/v4/handling-cors).

## Ordering reliability and load tests

See [ORDERING-CONCURRENCY.md](ORDERING-CONCURRENCY.md) for yearly hotel IDs, migration requirements, locking invariants, endpoint quotas, diagnostics and reproducible stress tests.


Apply `20261007140000_subscription_qr_lock` with `npm run db:migrate` before deploying QR uploads. Existing assigned QRs are locked by the migration. Image bytes are stored privately in `SubscriptionQrImage`, separate from public restaurant queries.
