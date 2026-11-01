"use client";
import Link from "next/link";
import { IST } from "@/lib/time";
import { SubscriptionNotice } from "./subscription-notice";
import { orderStage } from "@/lib/order-workflow";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  BarChart3,
  QrCode,
  Settings,
  LogOut,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Clock3,
  CircleCheck,
  Wallet,
  Bell,
  BellOff,
  Pause,
  Play,
  Search,
  SlidersHorizontal,
  ReceiptText,
  Users,
  X,
  Menu as MenuIcon,
  Leaf,
  Plus,
  Download,
} from "lucide-react";
import type {
  Analytics,
  Category,
  Order,
  Restaurant,
  Session,
} from "@/lib/types";
import {
  api,
  ApiError,
  money,
  patch,
  post,
  timeAgo,
  useLive,
} from "@/lib/client";
import {
  Badge,
  Brand,
  Empty,
  ErrorBox,
  FoodImage,
  Modal,
  SectionTitle,
  Spinner,
} from "./ui";
import { MenuManager, RestaurantSettings, RestaurantQR } from "./management";

const navigation = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    id: "orders",
    label: "Live orders",
    icon: ShoppingBag,
    href: "/dashboard/orders",
  },
  {
    id: "menu",
    label: "Menu management",
    icon: UtensilsCrossed,
    href: "/dashboard/menu",
  },
  {
    id: "sessions",
    label: "Customers & bills",
    icon: ReceiptText,
    href: "/dashboard/sessions",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: BarChart3,
    href: "/dashboard/analytics",
  },
  { id: "qr", label: "Restaurant QR", icon: QrCode, href: "/dashboard/qr" },
];
const nextStatus: Record<string, { status: string; label: string }> = {
  NEW: { status: "PREPARING", label: "Start preparing" },
  ACCEPTED: { status: "PREPARING", label: "Start preparing" },
  PREPARING: { status: "COMPLETED", label: "Complete order" },
  READY: { status: "COMPLETED", label: "Complete order" },
  SERVED: { status: "COMPLETED", label: "Complete order" },
};

export default function Dashboard({ section }: { section: string }) {
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<Restaurant>();
  const [user, setUser] = useState({ name: "", email: "" });
  const [orders, setOrders] = useState<Order[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Analytics>();
  const [days, setDays] = useState("1");
  const [reportDays, setReportDays] = useState("7");
  const [downloading, setDownloading] = useState(false);
  const downloadTransactions = async () => {
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/analytics/transactions.pdf?days=${reportDays}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Could not download the report.",
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "transactions.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [sound, setSound] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const navTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!mobileNav) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() =>
      navRef.current?.querySelector<HTMLButtonElement>(".nav-close")?.focus(),
    );
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNav(false);
      if (event.key !== "Tab") return;
      const links = Array.from(
        navRef.current?.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled)",
        ) || [],
      );
      const first = links[0],
        last = links[links.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const resize = () => {
      if (window.innerWidth > 1024) setMobileNav(false);
    };
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
      navTrigger.current?.focus();
    };
  }, [mobileNav]);
  const [selected, setSelected] = useState<Session>();
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [cancelOrder, setCancelOrder] = useState<Order>();
  const audio = useRef<AudioContext | null>(null);
  const heard = useRef(new Set<string>());
  const refreshing = useRef(false);
  const refreshRequested = useRef(false);
  const reload = useCallback(async (): Promise<void> => {
    if (refreshing.current) {
      refreshRequested.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const me = await api<{ restaurant: Restaurant; user: typeof user }>(
        "/auth/me",
      );
      if (me.restaurant.onboardingStatus === "DRAFT") {
        router.replace("/onboarding");
        return;
      }
      setRestaurant(me.restaurant);
      setUser(me.user);
      const [recent, active, visits, menu, analytics] = await Promise.all([
        api<{ orders: Order[] }>("/orders"),
        api<{ orders: Order[] }>("/orders?active=true"),
        api<Session[]>("/sessions"),
        api<Category[]>("/menu"),
        api<Analytics>(
          `/analytics?days=${section === "analytics" ? days : "1"}`,
        ),
      ]);
      setOrders(
        [
          ...new Map(
            [...recent.orders, ...active.orders].map((o) => [o.id, o]),
          ).values(),
        ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      setSessions(visits);
      setCategories(menu);
      setStats(analytics);
      setSelected((previous) =>
        previous ? visits.find((s) => s.id === previous.id) : undefined,
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
      else setError((e as Error).message);
    } finally {
      refreshing.current = false;
      if (refreshRequested.current) {
        refreshRequested.current = false;
        void reload();
      }
    }
  }, [router, section, days]);
  useEffect(() => {
    void reload();
  }, [reload]);
  const connected = useLive({ role: "admin" }, (event, payload) => {
    if (event === "order:new" && !heard.current.has(payload.id)) {
      heard.current.add(payload.id);
      setToast(
        `New order #${payload.orderNumber} · ${payload.orderSession.customerName}`,
      );
      if (sound && audio.current) {
        const oscillator = audio.current.createOscillator();
        const gain = audio.current.createGain();
        oscillator.connect(gain);
        gain.connect(audio.current.destination);
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.09, audio.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          audio.current.currentTime + 0.45,
        );
        oscillator.start();
        oscillator.stop(audio.current.currentTime + 0.45);
      }
    }
    void reload();
  });
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    setError("");
    try {
      await action();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const advance = (order: Order) =>
    act(order.id, () =>
      patch(`/orders/${order.id}/status`, {
        status: nextStatus[order.status].status,
      }),
    );
  const logout = async () => {
    setBusy("logout");
    setError("");
    try {
      await post("/auth/logout");
      // A full navigation discards all private workspace state and sockets.
      window.location.replace("/login");
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  };
  if (!restaurant || !stats)
    return (
      <div className="app-loading">
        <Brand />
        <Spinner />
        <ErrorBox message={error} />
      </div>
    );
  const newCount = orders.filter(
    (o) => orderStage(o.status) === "RECEIVED",
  ).length;
  const billCount = sessions.filter(
    (s) => s.status === "BILL_REQUESTED" && !s.paidAt,
  ).length;
  const activeOrders = orders.filter(
    (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
  );
  const fmt = (n: number | string) => money(n, restaurant.currency);
  const title = navigation.find((n) => n.id === section)?.label || "Settings";
  const filtered = orders.filter(
    (o) =>
      (tab === "ALL" || orderStage(o.status) === tab) &&
      `${o.orderNumber} ${o.orderSession?.customerName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="dashboard-shell">
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation backdrop"
          tabIndex={-1}
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        ref={navRef}
        className={`sidebar ${mobileNav ? "open" : ""}`}
        aria-label="Workspace navigation"
      >
        <button
          className="icon-button nav-close"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <X size={22} />
        </button>
        <Link
          href="/dashboard"
          className="sidebar-brand"
          onClick={() => setMobileNav(false)}
        >
          <Brand />
        </Link>
        <button
          className="restaurant-switch"
          onClick={() => {
            setMobileNav(false);
            router.push("/dashboard/settings");
          }}
        >
          <span className="restaurant-avatar">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt="" />
            ) : (
              <UtensilsCrossed size={21} />
            )}
          </span>
          <span>
            <strong>{restaurant.name}</strong>
            <small>Restaurant workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {navigation.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              className={section === n.id ? "active" : ""}
              onClick={() => setMobileNav(false)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "orders" && newCount > 0 && (
                <b className="nav-count">{newCount}</b>
              )}
              {n.id === "sessions" && billCount > 0 && (
                <b className="nav-count">{billCount}</b>
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="qr-tip">
            <span className="qr-tip-icon">
              <QrCode size={23} />
            </span>
            <strong>One QR. Endless possibilities.</strong>
            <p>Your menu, one scan away.</p>
            <Link href={`/r/${restaurant.slug}`} target="_blank">
              View customer menu <ArrowUpRight size={15} />
            </Link>
          </div>
          <Link
            className={`settings-link ${section === "settings" ? "active" : ""}`}
            href="/dashboard/settings"
            onClick={() => setMobileNav(false)}
          >
            <Settings size={19} /> Settings
          </Link>
          <div className="profile">
            <span className="user-avatar">{user.name.slice(0, 1)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>Restaurant owner</small>
            </span>
          </div>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              aria-expanded={mobileNav}
              aria-controls="workspace-navigation"
              ref={navTrigger}
              onClick={() => setMobileNav(true)}
            >
              <MenuIcon size={22} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className={`connection ${connected ? "" : "offline"}`}>
              <i />
              {connected ? "Live connection" : "Reconnecting"}
            </span>
            <button
              className={`icon-button sound-toggle ${sound ? "enabled" : ""}`}
              aria-label={sound ? "Mute order alerts" : "Enable order alerts"}
              title={sound ? "Mute order alerts" : "Enable order alerts"}
              onClick={async () => {
                if (!audio.current) audio.current = new AudioContext();
                await audio.current.resume();
                setSound(!sound);
              }}
            >
              {sound ? <Bell size={19} /> : <BellOff size={19} />}
            </button>
            <div className="topbar-divider" />
            <span className="user-avatar small">{user.name.slice(0, 1)}</span>
            <button
              className="logout-button"
              disabled={busy === "logout"}
              onClick={logout}
            >
              <LogOut size={16} />
              <span>{busy === "logout" ? "Logging out…" : "Log out"}</span>
            </button>
          </div>
        </header>
        <main className="dashboard-content">
          <ErrorBox message={error} />
          <SubscriptionNotice refreshKey={restaurant} />
          {section === "overview" && (
            <>
              <SectionTitle
                eyebrow="TODAY AT YOUR RESTAURANT"
                title={`Welcome back, ${user.name.split(" ")[0]}.`}
                description="Here’s what’s happening at your restaurant today."
                action={
                  <span className="date-pill">
                    <Clock3 size={16} />
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeZone: IST,
                    }).format(new Date())}
                  </span>
                }
              />
              <div className="restaurant-banner">
                <div className="restaurant-banner-art">
                  <UtensilsCrossed size={84} />
                </div>
                <div>
                  <span className="banner-tag">
                    <i />
                    {restaurant.orderingOpen
                      ? "YOUR KITCHEN IS OPEN"
                      : "ORDERS ARE PAUSED / CLOSED"}
                  </span>
                  <h2>Ready for the next great meal.</h2>
                  <p>
                    {restaurant.name} is{" "}
                    {restaurant.orderingOpen
                      ? "accepting orders. Let the good times roll."
                      : "visible to guests. Resume orders when your kitchen is ready."}
                  </p>
                </div>
                <button
                  className="button banner-button"
                  disabled={!!busy}
                  onClick={() =>
                    act("pause", () =>
                      patch("/restaurant", {
                        acceptingOrders: !restaurant.acceptingOrders,
                      }),
                    )
                  }
                >
                  {restaurant.acceptingOrders ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} />
                  )}{" "}
                  {restaurant.acceptingOrders
                    ? "Pause orders"
                    : "Resume orders"}
                </button>
              </div>
              <Metrics stats={stats} fmt={fmt} />
              <div className="overview-grid">
                <section className="panel orders-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        Live orders{" "}
                        <span className="count-pill">
                          {activeOrders.length}
                        </span>
                      </h2>
                      <p>
                        Start preparing received orders and keep guests updated.
                      </p>
                    </div>
                    <Link href="/dashboard/orders" className="text-link">
                      View all orders <ArrowUpRight size={16} />
                    </Link>
                  </div>
                  <div className="mini-tabs">
                    {["ALL", "RECEIVED", "PREPARING", "COMPLETED"].map((t) => (
                      <button
                        key={t}
                        className={tab === t ? "active" : ""}
                        onClick={() => setTab(t)}
                      >
                        {t === "ALL"
                          ? "All orders"
                          : t.charAt(0) + t.slice(1).toLowerCase()}
                        <span>
                          {
                            orders.filter(
                              (o) => t === "ALL" || orderStage(o.status) === t,
                            ).length
                          }
                        </span>
                      </button>
                    ))}
                  </div>
                  <OrderTable
                    orders={orders
                      .filter(
                        (o) => tab === "ALL" || orderStage(o.status) === tab,
                      )
                      .slice(0, 6)}
                    fmt={fmt}
                    busy={busy}
                    advance={advance}
                    openSession={(id) =>
                      setSelected(sessions.find((s) => s.id === id))
                    }
                  />
                  {!filtered.length && (
                    <Empty
                      icon={<ShoppingBag size={28} />}
                      title="Your kitchen’s next chapter starts here"
                      text="New orders appear here instantly when a guest orders from your QR menu."
                    />
                  )}
                  <div className="panel-footer">
                    <span className="connection">
                      <i />
                      Updates automatically
                    </span>
                    <span>Made fresh. Served with care.</span>
                  </div>
                </section>
                <aside className="overview-side">
                  <section className="panel bill-panel">
                    <div className="panel-heading">
                      <h2>
                        <ReceiptText size={18} /> Bill requests
                      </h2>
                      <span className="count-pill orange">{billCount}</span>
                    </div>
                    {billCount ? (
                      sessions
                        .filter(
                          (s) => s.status === "BILL_REQUESTED" && !s.paidAt,
                        )
                        .slice(0, 3)
                        .map((s) => (
                          <button
                            className="bill-request-row"
                            key={s.id}
                            onClick={() => setSelected(s)}
                          >
                            <span className="customer-avatar">
                              {s.customerName[0]}
                            </span>
                            <span>
                              <strong>{s.customerName}</strong>
                              <small>
                                {s.orders.length} orders · Pay at counter
                              </small>
                            </span>
                            <strong>{fmt(s.total)}</strong>
                            <ArrowRight size={16} />
                          </button>
                        ))
                    ) : (
                      <div className="quiet-state">
                        <CircleCheck size={24} />
                        <strong>All caught up</strong>
                        <p>Bill requests will show up here.</p>
                      </div>
                    )}
                  </section>
                  <section className="panel popular-panel">
                    <div className="panel-heading">
                      <h2>Today’s favourites</h2>
                      <span className="eyebrow">TOP DISHES</span>
                    </div>
                    {stats.dishes.length ? (
                      stats.dishes.slice(0, 4).map((d, i) => {
                        const item = categories
                          .flatMap((c) => c.items)
                          .find((m) => m.name === d.name);
                        return (
                          <div className="popular-row" key={d.name}>
                            <span className="rank">0{i + 1}</span>
                            <FoodImage
                              src={item?.imageUrl || ""}
                              alt={d.name}
                            />
                            <span>
                              <strong>{d.name}</strong>
                              <small>{d.quantity} ordered</small>
                            </span>
                            <b>{fmt(d.sales)}</b>
                          </div>
                        );
                      })
                    ) : (
                      <div className="quiet-state">
                        <UtensilsCrossed size={24} />
                        <p>
                          Your guests’ favourites will appear after the first
                          order.
                        </p>
                      </div>
                    )}
                    <Link
                      className="panel-bottom-link"
                      href="/dashboard/analytics"
                    >
                      Explore your analytics <ArrowUpRight size={16} />
                    </Link>
                  </section>
                </aside>
              </div>
              <div className="bottom-note">
                <Leaf size={16} />
                <span>
                  Less waiting, more enjoying. That’s the TableBabu way.
                </span>
                <span>Built for your everyday.</span>
              </div>
            </>
          )}
          {section === "orders" && (
            <>
              <SectionTitle
                eyebrow="LIVE ORDERS"
                title="Live orders"
                description="Every guest. Every order. Right on time."
                action={
                  <span className="live-pill">
                    <i />
                    {newCount} received orders
                  </span>
                }
              />
              <div className="toolbar">
                <div className="search-field">
                  <Search size={18} />
                  <input
                    placeholder="Search name or order number"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <span className="muted text-sm">
                  Latest 100 + active orders
                </span>
              </div>
              <div className="order-tabs">
                {["ALL", "RECEIVED", "PREPARING", "COMPLETED"].map((t) => (
                  <button
                    key={t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t === "ALL" ? "All orders" : t.toLowerCase()}{" "}
                    <span>
                      {
                        orders.filter(
                          (o) => t === "ALL" || orderStage(o.status) === t,
                        ).length
                      }
                    </span>
                  </button>
                ))}
              </div>
              <div className="order-grid">
                {filtered.map((o) => (
                  <article
                    className={`order-card ${o.status === "NEW" ? "new-order" : ""}`}
                    key={o.id}
                  >
                    <div className="order-card-top">
                      <Badge status={orderStage(o.status)} />
                      <span>{timeAgo(o.createdAt)}</span>
                    </div>
                    <div className="order-person">
                      <h2>{o.orderSession?.customerName}</h2>
                      <strong>#{o.orderNumber}</strong>
                    </div>
                    <div className="order-lines">
                      {o.items.map((i) => (
                        <div key={i.id}>
                          <span>
                            <b>{i.quantity}×</b> {i.itemNameSnapshot}
                            {i.notes && <small>{i.notes}</small>}
                          </span>
                          <span>{fmt(i.total)}</span>
                        </div>
                      ))}
                    </div>
                    {o.customerNote && (
                      <div className="order-note">Note: {o.customerNote}</div>
                    )}
                    <div className="order-total">
                      <span>Order total</span>
                      <strong>{fmt(o.subtotal)}</strong>
                    </div>
                    {nextStatus[o.status] && (
                      <button
                        disabled={busy === o.id}
                        className={`button full ${o.status === "NEW" ? "primary" : "secondary"}`}
                        onClick={() => advance(o)}
                      >
                        {busy === o.id
                          ? "Updating…"
                          : nextStatus[o.status].label}
                        <ArrowRight size={16} />
                      </button>
                    )}
                    <div className="order-card-bottom">
                      <button
                        className="text-link"
                        onClick={() =>
                          setSelected(
                            sessions.find((s) => s.id === o.orderSessionId),
                          )
                        }
                        disabled={
                          !sessions.some((s) => s.id === o.orderSessionId)
                        }
                      >
                        View session
                      </button>
                      {["NEW", "ACCEPTED", "PREPARING"].includes(o.status) && (
                        <button
                          className="text-link muted"
                          onClick={() => setCancelOrder(o)}
                        >
                          Cancel order
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!filtered.length && (
                <Empty
                  icon={<ShoppingBag size={30} />}
                  title="No orders here yet"
                  text="New orders arrive automatically. You can keep this page open."
                />
              )}
            </>
          )}
          {section === "menu" && (
            <MenuManager
              categories={categories}
              restaurant={restaurant}
              reload={reload}
            />
          )}
          {section === "sessions" && (
            <>
              <SectionTitle
                eyebrow="CUSTOMER VISITS"
                title="Customers & bills"
                description="One visit, one running bill. Payment happens at your counter."
              />
              <div className="session-grid">
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    className="session-card"
                    onClick={() => setSelected(s)}
                  >
                    <div>
                      <span className="customer-avatar">
                        {s.customerName[0]}
                      </span>
                      <Badge status={s.paidAt ? "PAID" : s.status} />
                    </div>
                    <h2>{s.customerName}</h2>
                    {s.paymentMethod && (
                      <span className="badge">
                        {s.paymentMethod === "CASH" ? "Cash" : "UPI"}
                      </span>
                    )}
                    <p>
                      {s.orders.map((o) => `#${o.orderNumber}`).join(" · ") ||
                        "Browsing the menu"}
                    </p>
                    <div className="session-total">
                      <span>{s.orders.length} orders</span>
                      <strong>{fmt(s.total)}</strong>
                    </div>
                    {s.serviceRequests.some(
                      (r) => r.type === "NEED_HELP" && r.status === "PENDING",
                    ) && <span className="help-tag">Guest needs help</span>}
                  </button>
                ))}
              </div>
              {!sessions.length && (
                <Empty
                  icon={<Users size={30} />}
                  title="Ready to welcome your guests"
                  text="Active visits and bill requests will appear here."
                />
              )}
            </>
          )}
          {section === "analytics" && (
            <>
              <SectionTitle
                eyebrow="SALES & PAYMENTS"
                title="Your restaurant, at a glance"
                description="Understand what your guests love and when your kitchen gets busy."
                action={
                  <select
                    aria-label="Analytics period"
                    className="period-select"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  >
                    <option value="1">Today</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                  </select>
                }
              />
              <Metrics stats={stats} fmt={fmt} />
              <section
                className="panel chart-panel transaction-export"
                aria-label="Download transactions"
              >
                <div>
                  <h2>Download transactions</h2>
                  <p className="muted text-sm">
                    Paid bills, payment methods, and totals. Filtered by the
                    date payment was received.
                  </p>
                </div>
                <div className="transaction-export-controls">
                  <label>
                    Report period
                    <select
                      aria-label="Transaction report period"
                      value={reportDays}
                      onChange={(e) => setReportDays(e.target.value)}
                      disabled={downloading}
                    >
                      <option value="7">1 week</option>
                      <option value="14">2 weeks</option>
                      <option value="21">3 weeks</option>
                      <option value="30">1 month (30 days)</option>
                    </select>
                  </label>
                  <button
                    className="button primary"
                    disabled={downloading}
                    onClick={downloadTransactions}
                  >
                    <Download size={18} />
                    {downloading ? "Preparing PDF…" : "Download PDF"}
                  </button>
                </div>
              </section>
              <section
                className="panel chart-panel payment-analytics"
                aria-label="Payment methods"
              >
                <h2>UPI &amp; Cash payments</h2>
                <p className="muted text-sm">
                  Customer choices and confirmed payments for orders placed in
                  the selected period. Each visit counts once per method;
                  cancelled orders are excluded.
                </p>
                <div className="payment-method-grid">
                  {stats.paymentMethods.map((payment) => (
                    <article
                      className="payment-method-stat"
                      key={payment.method}
                      aria-label={`${payment.method === "UNRECORDED" ? "Not selected / recorded" : payment.method === "CASH" ? "Cash" : "UPI"} payment statistics`}
                    >
                      <h3>
                        {payment.method === "UNRECORDED"
                          ? "Not selected / recorded"
                          : payment.method === "CASH"
                            ? "Cash"
                            : "UPI"}
                      </h3>
                      <p>
                        {payment.visits}{" "}
                        {payment.visits === 1 ? "visit" : "visits"}
                        {payment.method === "UNRECORDED"
                          ? " without a recorded method"
                          : " chose this method"}
                      </p>
                      <dl>
                        <div>
                          <dt>Confirmed received</dt>
                          <dd>{fmt(payment.collected)}</dd>
                        </div>
                        <div>
                          <dt>Paid visits</dt>
                          <dd>{payment.paidVisits}</dd>
                        </div>
                        <div>
                          <dt>Awaiting payment</dt>
                          <dd>{fmt(payment.pending)}</dd>
                        </div>
                        <div>
                          <dt>Unpaid visits</dt>
                          <dd>{payment.pendingVisits}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
                <p className="muted text-sm">
                  Choosing UPI or Cash does not confirm payment. Received
                  amounts require staff to mark the bill paid. These totals
                  follow order dates, not payment dates.
                </p>
              </section>
              <div className="analytics-grid">
                <section className="panel chart-panel">
                  <h2>{days === "1" ? "Orders by hour" : "Sales over time"}</h2>
                  <p className="muted text-sm">
                    IST · Cancelled orders excluded
                  </p>
                  <div className="bar-chart">
                    {(days === "1"
                      ? stats.hourly.map((v, i) => ({
                          label: `${i}:00`,
                          value: v,
                        }))
                      : Object.entries(stats.daily).map(([label, value]) => ({
                          label: label.slice(5),
                          value,
                        }))
                    ).map((d, i, list) => (
                      <div className="bar-column" key={d.label}>
                        <span className="bar-value">
                          {d.value > 0
                            ? days === "1"
                              ? d.value
                              : fmt(d.value)
                            : ""}
                        </span>
                        <div
                          title={`${d.label}: ${days === "1" ? d.value + " orders" : fmt(d.value)}`}
                          className="chart-bar"
                          style={{
                            height: `${Math.max(2, (d.value / Math.max(...list.map((x) => x.value), 1)) * 160)}px`,
                          }}
                        />
                        <span>
                          {list.length < 10 || i % 3 === 0 ? d.label : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel chart-panel">
                  <h2>Sales by category</h2>
                  <div className="category-performance">
                    {Object.entries(stats.categories).map(([name, value]) => (
                      <div key={name}>
                        <div>
                          <strong>{name}</strong>
                          <span>{fmt(value)}</span>
                        </div>
                        <progress
                          max={Math.max(stats.sales, 1)}
                          value={value}
                        />
                      </div>
                    ))}
                    {!stats.orders && (
                      <Empty
                        title="No sales yet"
                        text="Category performance appears after your first order."
                      />
                    )}
                  </div>
                </section>
                <section className="panel chart-panel">
                  <h2>Most ordered dishes</h2>
                  {stats.dishes.map((d, i) => (
                    <div className="dish-stat" key={d.name}>
                      <span className="rank">0{i + 1}</span>
                      <strong>{d.name}</strong>
                      <span>{d.quantity} ordered</span>
                      <b>{fmt(d.sales)}</b>
                    </div>
                  ))}
                </section>
                <section className="panel chart-panel">
                  <h2>At the counter</h2>
                  <div className="collection-stat">
                    <span>Collected for orders in this period</span>
                    <strong>{fmt(stats.collected)}</strong>
                  </div>
                  <div className="collection-stat">
                    <span>Average order value</span>
                    <strong>{fmt(stats.average)}</strong>
                  </div>
                  <div className="collection-stat">
                    <span>Cancelled orders</span>
                    <strong>{stats.cancelled}</strong>
                  </div>
                  <p className="muted text-sm">
                    Sales reflect placed orders. Collected reflects sessions
                    marked paid by your team.
                  </p>
                </section>
              </div>
            </>
          )}
          {section === "qr" && <RestaurantQR restaurant={restaurant} />}
          {section === "settings" && (
            <RestaurantSettings restaurant={restaurant} reload={reload} />
          )}
          {![
            "overview",
            "orders",
            "menu",
            "sessions",
            "analytics",
            "qr",
            "settings",
          ].includes(section) && (
            <Empty
              title="Page not found"
              text="Choose a page from the restaurant workspace."
            />
          )}
        </main>
        <footer className="dashboard-footer">
          <span>© {new Date().getFullYear()} TableBabu</span>
          <span>Thoughtfully simple. Deliciously effective.</span>
          <span>SCAN. ORDER. ENJOY.</span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Bell size={18} />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {cancelOrder && (
        <Modal
          title={`Cancel order #${cancelOrder.orderNumber}?`}
          onClose={() => setCancelOrder(undefined)}
        >
          <p className="muted">
            This removes the order from {cancelOrder.orderSession?.customerName}
            ’s bill and cannot be undone.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setCancelOrder(undefined)}
            >
              Keep order
            </button>
            <button
              className="button danger"
              disabled={!!busy}
              onClick={() =>
                act(cancelOrder.id, async () => {
                  await patch(`/orders/${cancelOrder.id}/status`, {
                    status: "CANCELLED",
                  });
                  setCancelOrder(undefined);
                })
              }
            >
              Cancel order
            </button>
          </div>
        </Modal>
      )}
      {selected && (
        <Modal title="Customer bill" onClose={() => setSelected(undefined)}>
          <div className="bill-customer">
            <span className="customer-avatar large">
              {selected.customerName[0]}
            </span>
            <h2>{selected.customerName}</h2>
            <Badge status={selected.paidAt ? "PAID" : selected.status} />
          </div>
          <p className="bill-payment-note">
            <strong>
              Payment method:{" "}
              {selected.paymentMethod === "CASH"
                ? "Cash"
                : selected.paymentMethod || "Not selected"}
            </strong>
          </p>
          {selected.orders.map((o) => (
            <div
              className={`bill-order ${o.status === "CANCELLED" ? "cancelled" : ""}`}
              key={o.id}
            >
              <div>
                <strong>Order #{o.orderNumber}</strong>
                <Badge status={orderStage(o.status)} />
              </div>
              {o.items.map((i) => (
                <div key={i.id}>
                  <span>
                    {i.itemNameSnapshot} × {i.quantity}
                  </span>
                  <span>{fmt(i.total)}</span>
                </div>
              ))}
              {nextStatus[o.status] && !selected.paidAt && (
                <button
                  className="text-link"
                  disabled={!!busy}
                  onClick={() => advance(o)}
                >
                  {nextStatus[o.status].label} <ArrowRight size={15} />
                </button>
              )}
            </div>
          ))}
          <div className="bill-grand-total">
            <span>Session total</span>
            <strong>{fmt(selected.total)}</strong>
          </div>
          {selected.serviceRequests
            .filter((r) => r.status !== "COMPLETED")
            .map((r) => (
              <div className="service-line" key={r.id}>
                <span>
                  {r.type === "REQUEST_BILL"
                    ? "Bill requested"
                    : "Guest needs help"}{" "}
                  · {r.status.toLowerCase()}
                </span>
                <button
                  className="text-link"
                  onClick={() =>
                    act(r.id, () =>
                      patch(`/service-requests/${r.id}`, {
                        status:
                          r.status === "PENDING" ? "ACKNOWLEDGED" : "COMPLETED",
                      }),
                    )
                  }
                >
                  {r.status === "PENDING" ? "Acknowledge" : "Resolve"}
                </button>
              </div>
            ))}
          <ErrorBox message={error} />
          <p className="bill-payment-note">
            Confirm payment at the counter before marking paid. Finish all
            orders first.
          </p>
          <div className="modal-actions">
            {!selected.paidAt &&
              selected.orders.some((o) => o.status !== "CANCELLED") && (
                <button
                  className="button primary"
                  disabled={
                    !!busy ||
                    selected.orders.some(
                      (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
                    )
                  }
                  onClick={() =>
                    act(selected.id, () =>
                      post(`/sessions/${selected.id}/paid`),
                    )
                  }
                >
                  <Wallet size={17} /> Mark paid
                </button>
              )}
            <button
              className="button secondary"
              disabled={
                !!busy ||
                (!selected.paidAt &&
                  selected.orders.some((o) => o.status !== "CANCELLED"))
              }
              onClick={() =>
                act(selected.id, async () => {
                  await post(`/sessions/${selected.id}/close`);
                  setSelected(undefined);
                })
              }
            >
              Close session <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Metrics({
  stats,
  fmt,
}: {
  stats: Analytics;
  fmt: (n: number) => string;
}) {
  return (
    <div className="metrics-grid">
      {[
        {
          label: "Total sales",
          value: fmt(stats.sales),
          sub: "Excludes cancelled orders",
          icon: Wallet,
          kind: "green",
        },
        {
          label: "Orders received",
          value: stats.orders,
          sub: `${fmt(stats.average)} average order`,
          icon: ShoppingBag,
          kind: "orange",
        },
        {
          label: "Active orders",
          value: stats.active,
          sub: `${stats.preparing} preparing right now`,
          icon: Clock3,
          kind: "gold",
        },
        {
          label: "Completed",
          value: stats.completed,
          sub: "Orders completed in this period",
          icon: CircleCheck,
          kind: "blue",
        },
      ].map((m) => (
        <section className="metric-card" key={m.label}>
          <div>
            <span>{m.label}</span>
            <span className={`metric-icon ${m.kind}`}>
              <m.icon size={19} />
            </span>
          </div>
          <strong>{m.value}</strong>
          <p>{m.sub}</p>
        </section>
      ))}
    </div>
  );
}
function OrderTable({
  orders,
  fmt,
  busy,
  advance,
  openSession,
}: {
  orders: Order[];
  fmt: (n: string) => string;
  busy: string;
  advance: (o: Order) => void;
  openSession: (id: string) => void;
}) {
  return orders.length ? (
    <div className="table-scroll">
      <table className="orders-table">
        <thead>
          <tr>
            <th>ORDER / CUSTOMER</th>
            <th>STATUS</th>
            <th>AMOUNT</th>
            <th>ACTION</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <button
                  className="customer-cell"
                  onClick={() => openSession(o.orderSessionId)}
                >
                  <span className="customer-avatar">
                    {o.orderSession?.customerName[0]}
                  </span>
                  <span>
                    <strong>{o.orderSession?.customerName}</strong>
                    <small>
                      #{o.orderNumber} <i>·</i> {timeAgo(o.createdAt)}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                <Badge status={orderStage(o.status)} />
              </td>
              <td>
                <strong>{fmt(o.subtotal)}</strong>
                <small className="item-count">
                  {o.items.reduce((n, i) => n + i.quantity, 0)} items
                </small>
              </td>
              <td>
                {nextStatus[o.status] && (
                  <button
                    className={`table-action ${o.status === "NEW" ? "accept" : ""}`}
                    disabled={busy === o.id}
                    onClick={() => advance(o)}
                  >
                    {nextStatus[o.status].label}
                    <ArrowRight size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;
}
