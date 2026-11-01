"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, post, money, ApiError } from "@/lib/client";
import { Brand, ErrorBox, Modal } from "./ui";
import { istDate, istDateKey, istDayBoundary, istDateTime } from "@/lib/time";
import { TeamManagement } from "./team-management";
import { SubscriptionQrEditor } from "./subscription-qr-editor";
import { AccountSecurity } from "./account-security";

type Hotel = {
  restaurantId: string;
  name: string;
  slug: string;
  status: string;
  frozen: boolean;
  daysRemaining: number | null;
  reason: string;
  startsAt: string | null;
  endsAt: string | null;
  version: number;
  hasQr: boolean;
  qrLocked: boolean;
  qrUploaded: boolean;
  upiId: string;
  payee: string;
  amount: string;
  owner: { name: string; email: string };
  payments?: {
    id: string;
    amount: string;
    reference: string;
    startsAt: string;
    endsAt: string;
    createdAt: string;
  }[];
  actions?: {
    id: string;
    action: string;
    actorId: string;
    actorName: string;
    createdAt: string;
  }[];
};
const date = istDate;

export default function PlatformDashboard() {
  const [rows, setRows] = useState<Hotel[]>([]),
    [total, setTotal] = useState(0);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<Hotel>();
  const [team, setTeam] = useState(false);
  const [access, setAccess] = useState<{
    isAdmin: boolean;
    permissions: string[];
  }>({ isAdmin: false, permissions: [] });
  const [security, setSecurity] = useState(false);
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api<{ isAdmin: boolean; permissions: string[] }>(
        "/platform/me",
      );
      setAccess(me);
      const result = await api<{ restaurants: Hotel[]; total: number }>(
        `/platform/restaurants?search=${encodeURIComponent(query)}&page=${page}`,
      );
      setRows(result.restaurants);
      setTotal(result.total);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        window.location.replace("/login");
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, page]);
  useEffect(() => {
    void load();
  }, [load]);
  async function open(id: string) {
    setError("");
    setNotice("");
    try {
      setSelected(await api<Hotel>(`/platform/restaurants/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="platform-page">
      <header className="platform-header">
        <Brand />
        <div>
          {access.isAdmin && (
            <a className="button secondary" href="/control-room/privacy">
              Privacy requests
            </a>
          )}
          {access.isAdmin && (
            <button className="button secondary" onClick={() => setTeam(!team)}>
              {team ? "Restaurants" : "Employees & roles"}
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => setSecurity(!security)}
          >
            Account security
          </button>
          <button
            className="button secondary"
            onClick={async () => {
              try {
                await post("/auth/logout");
                window.location.replace("/login");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Log out
          </button>
        </div>
      </header>
      {team ? (
        <>
          <ErrorBox message={error} />
          {security && <AccountSecurity />}
          <TeamManagement />
        </>
      ) : (
        <>
          <div className="section-title">
            <div>
              <div className="eyebrow">PLATFORM ADMINISTRATION</div>
              <h1>Restaurants & subscriptions</h1>
              <p>
                Manage access, send payment details, and record subscription
                payments.
              </p>
            </div>
            <span className="platform-total">{total} restaurants</span>
          </div>
          {security && <AccountSecurity />}
          <ErrorBox message={error} />
          <form
            className="platform-search"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQuery(search);
            }}
          >
            <label className="sr-only" htmlFor="hotel-search">
              Search restaurants
            </label>
            <input
              id="hotel-search"
              placeholder="Search restaurant, URL, or owner email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="button primary">Search</button>
            <button
              className="button secondary"
              type="button"
              disabled={loading}
              onClick={() => void load()}
            >
              Refresh
            </button>
          </form>
          <p className="muted text-sm">
            Unconfigured restaurants remain available until you set a
            subscription or freeze them. Dates and times are shown in IST.
          </p>
          <div className="platform-list" aria-busy={loading}>
            {!loading && !rows.length && (
              <p className="panel">No restaurants found.</p>
            )}
            {rows.map((r) => (
              <article className="panel platform-row" key={r.restaurantId}>
                <div>
                  <h2>{r.name}</h2>
                  <p>
                    {r.owner.name} · {r.owner.email}
                  </p>
                  <small>/r/{r.slug}</small>
                </div>
                <div>
                  <span
                    className={`platform-status ${r.status.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {r.status}
                  </span>
                  <p>
                    <strong>
                      {r.daysRemaining === null
                        ? "No timeline"
                        : `${r.daysRemaining} days remaining`}
                    </strong>
                  </p>
                  <small>Valid through {date(r.endsAt)}</small>
                </div>
                <button
                  className="button secondary"
                  onClick={() => void open(r.restaurantId)}
                  aria-label={`Manage ${r.name}`}
                >
                  Manage restaurant
                </button>
              </article>
            ))}
          </div>
          <nav className="platform-pagination" aria-label="Restaurant pages">
            <button
              className="button secondary"
              disabled={page === 0 || loading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button
              className="button secondary"
              disabled={(page + 1) * 25 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </nav>
          {selected && (
            <Modal
              title={selected.name}
              wide
              onClose={() => setSelected(undefined)}
            >
              {notice && (
                <p className="saved-message" role="status">
                  {notice}
                </p>
              )}
              <HotelEditor
                key={selected.restaurantId}
                hotel={selected}
                permissions={access.permissions}
                isAdmin={access.isAdmin}
                onChanged={async () => {
                  await open(selected.restaurantId);
                  await load();
                  setNotice("Restaurant subscription updated.");
                }}
              />
            </Modal>
          )}
        </>
      )}
    </main>
  );
}

function HotelEditor({
  hotel: r,
  isAdmin,
  onChanged,
  permissions,
}: {
  hotel: Hotel;
  isAdmin: boolean;
  permissions: string[];
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tabs = [
    permissions.includes("access:manage") && "access",
    permissions.includes("qr:manage") && "payment QR",
    permissions.includes("payments:record") && "record payment",
    permissions.includes("payments:view") && "history",
  ].filter(Boolean) as string[];
  const [mode, setMode] = useState(tabs[0] || "details");
  const requestKey = useRef<{ body: string; key: string } | null>(null);
  const start = istDateKey();
  const end = istDateKey(
    new Date(
      Math.max(Date.now(), r.endsAt ? new Date(r.endsAt).getTime() : 0) +
        30 * 86400000,
    ),
  );
  async function save(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (body.action === "payment") {
        const encoded = JSON.stringify(body),
          storageKey = `subscription-payment-${r.restaurantId}`;
        if (!requestKey.current) {
          try {
            requestKey.current = JSON.parse(
              sessionStorage.getItem(storageKey) || "null",
            );
          } catch {
            /* New submission. */
          }
        }
        if (requestKey.current?.body !== encoded)
          requestKey.current = { body: encoded, key: crypto.randomUUID() };
        sessionStorage.setItem(storageKey, JSON.stringify(requestKey.current));
        body.idempotencyKey = requestKey.current!.key;
      }
      await post(`/platform/restaurants/${r.restaurantId}`, {
        ...body,
        version: r.version,
      });
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="platform-editor">
      <div className="platform-summary">
        <strong>
          {r.status} ·{" "}
          {r.daysRemaining === null
            ? "No subscription set"
            : `${r.daysRemaining} days remaining`}
        </strong>
        <p>
          {date(r.startsAt)} — {date(r.endsAt)} (IST)
        </p>
        <p>{r.owner.email}</p>
      </div>
      <div className="platform-tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            className={`button ${mode === tab ? "primary" : "secondary"}`}
            onClick={() => setMode(tab)}
            key={tab}
          >
            {tab}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {mode === "access" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              action: "freeze",
              frozen: !r.frozen,
              reason: String(f.get("reason") || ""),
            });
          }}
        >
          <h3>
            {r.frozen ? "Restore restaurant access" : "Freeze new orders"}
          </h3>
          <p>
            Existing orders and bills stay accessible. Unfreezing does not
            extend an expired subscription.
          </p>
          {r.frozen ? (
            <p>Freeze reason: {r.reason}</p>
          ) : (
            <label>
              Reason shown to the owner
              <textarea
                name="reason"
                required
                minLength={2}
                maxLength={300}
                placeholder="Subscription payment is overdue"
              />
            </label>
          )}
          <button className="button primary" disabled={busy}>
            {r.frozen ? "Unfreeze restaurant" : "Freeze restaurant"}
          </button>
        </form>
      )}
      {mode === "payment QR" && (
        <SubscriptionQrEditor
          key={r.version}
          hotel={r}
          isAdmin={isAdmin}
          busy={busy}
          save={save}
          onChanged={onChanged}
        />
      )}
      {mode === "record payment" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save({
              action: "payment",
              amount: Number(f.get("amount")),
              reference: String(f.get("reference")),
              startsAt: istDayBoundary(String(f.get("startsAt"))).toISOString(),
              endsAt: istDayBoundary(
                String(f.get("endsAt")),
                true,
              ).toISOString(),
              unfreeze: f.get("unfreeze") === "on",
            });
          }}
        >
          <h3>Payment received</h3>
          <p>
            Record a verified payment and replace the restaurant's subscription
            dates. Scanning the QR never activates a subscription automatically.
          </p>
          <label>
            Amount received (INR)
            <input
              name="amount"
              type="number"
              required
              min="0.01"
              max="999999"
              step="0.01"
              defaultValue={r.amount}
            />
          </label>
          <label>
            Payment reference (unique)
            <input
              name="reference"
              required
              minLength={2}
              maxLength={120}
              placeholder="UPI transaction ID or cash receipt reference"
            />
          </label>
          <div className="platform-date-fields">
            <label>
              Subscription starts (IST)
              <input
                name="startsAt"
                type="date"
                required
                defaultValue={start}
              />
            </label>
            <label>
              Valid through (IST)
              <input name="endsAt" type="date" required defaultValue={end} />
            </label>
          </div>
          <label className="platform-checkbox">
            <input
              type="checkbox"
              name="unfreeze"
              defaultChecked={r.frozen && permissions.includes("access:manage")}
              disabled={!permissions.includes("access:manage")}
            />
            Unfreeze restaurant after recording payment
          </label>
          <label className="platform-checkbox">
            <input type="checkbox" required />I have verified that this payment
            was received.
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Record payment & set dates"}
          </button>
        </form>
      )}
      {mode === "history" && (
        <div>
          <h3>Recent payments</h3>
          {!r.payments?.length && <p>No subscription payments recorded.</p>}
          {r.payments?.map((p) => (
            <article className="platform-history" key={p.id}>
              <strong>
                {money(p.amount)} · {p.reference}
              </strong>
              <p>
                {date(p.startsAt)} — {date(p.endsAt)}
              </p>
              <small>Recorded {istDateTime(p.createdAt)}</small>
            </article>
          ))}
          <h3>Recent admin actions</h3>
          {r.actions?.map((a) => (
            <p key={a.id}>
              {a.action} · {istDateTime(a.createdAt)} ·{" "}
              <small>{a.actorName}</small>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
