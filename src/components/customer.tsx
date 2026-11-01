"use client";
import { festivalTheme } from "@/lib/festival-themes";
import { FestivalBanner } from "./festival-banner";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  Heart,
  Leaf,
  MapPin,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { Category, MenuItem, Restaurant, Session } from "@/lib/types";
import { api, ApiError, money, post, useLive } from "@/lib/client";
import { Empty, ErrorBox, FoodImage, Modal, Spinner } from "./ui";
import { LegalLinks } from "./legal-links";

type CartLine = { menuItemId: string; quantity: number; notes: string };
export default function Customer({
  slug,
  view,
}: {
  slug: string;
  view: string;
}) {
  const router = useRouter();
  const [restaurant, setRestaurant] = useState<Restaurant>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [veg, setVeg] = useState(false);
  const [note, setNote] = useState("");
  const [billDialog, setBillDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"UPI" | "CASH" | "">("");
  const [toast, setToast] = useState("");
  const [name, setName] = useState("");
  const restored = useRef("");
  const refreshing = useRef(false);
  const refreshRequested = useRef(false);
  const pendingSubmission = useRef<{ signature: string; key: string } | null>(
    null,
  );
  const readySeen = useRef(new Set<string>());
  const submitting = useRef(false);
  const base = `/r/${slug}`;
  const load = useCallback(async (): Promise<void> => {
    if (refreshing.current) {
      refreshRequested.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const menu = await api<{
        restaurant: Restaurant;
        categories: Category[];
      }>(`/public/restaurants/${encodeURIComponent(slug)}/menu`);
      setRestaurant(menu.restaurant);
      setCategories(menu.categories);
      try {
        const s = await api<Session>(
          `/public/sessions/current?slug=${encodeURIComponent(slug)}`,
        );
        setSession(s);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setSession(null);
        else throw e;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
      refreshing.current = false;
      if (refreshRequested.current) {
        refreshRequested.current = false;
        void load();
      }
    }
  }, [slug]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (session && restored.current !== session.id) {
      restored.current = session.id;
      setPaymentMethod(session.paymentMethod || "");
      try {
        const saved = JSON.parse(
          localStorage.getItem(`cart:${session.id}`) || "[]",
        );
        if (Array.isArray(saved))
          setCart(
            saved
              .filter(
                (i) =>
                  typeof i.menuItemId === "string" &&
                  Number.isInteger(i.quantity) &&
                  i.quantity > 0 &&
                  i.quantity <= 20,
              )
              .map((i) => ({
                ...i,
                notes: typeof i.notes === "string" ? i.notes.slice(0, 200) : "",
              })),
          );
      } catch {
        /* A malformed cart is safely discarded. */
      }
      if (
        view === "welcome" &&
        session.status !== "COMPLETED" &&
        !session.paidAt
      )
        router.replace(`${base}/menu`);
    }
  }, [session, view, router, base]);
  const saveCart = (next: CartLine[]) => {
    setCart(next);
    if (session) {
      try {
        localStorage.setItem(`cart:${session.id}`, JSON.stringify(next));
      } catch {
        /* Ordering still works when storage is unavailable. */
      }
    }
  };
  const connected = useLive(
    { slug },
    (event, payload) => {
      if (event === "order:ready" && !readySeen.current.has(payload.id)) {
        readySeen.current.add(payload.id);
        setToast(
          `Your order #${payload.orderNumber} will be with you shortly.`,
        );
        if ("vibrate" in navigator) navigator.vibrate([100, 60, 100]);
      }
      void load();
    },
    session?.id,
  );
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  const items = categories.flatMap((c) => c.items);
  const fmt = (n: string | number) => money(n, restaurant?.currency || "INR");
  const total = cart.reduce(
    (sum, line) =>
      sum +
      Number(items.find((i) => i.id === line.menuItemId)?.price || 0) *
        line.quantity,
    0,
  );
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  const orderingAllowed =
    !!restaurant?.orderingOpen &&
    session?.status === "ACTIVE" &&
    !session.paidAt;
  const add = (item: MenuItem, delta: number) => {
    const current = cart.find((i) => i.menuItemId === item.id);
    const quantity = (current?.quantity || 0) + delta;
    if (quantity > 20) return;
    saveCart(
      current
        ? cart
            .map((i) => (i.menuItemId === item.id ? { ...i, quantity } : i))
            .filter((i) => i.quantity > 0)
        : [...cart, { menuItemId: item.id, quantity: 1, notes: "" }],
    );
  };
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!loaded)
    return (
      <div className="customer-loading">
        <Spinner />
      </div>
    );
  if (!restaurant)
    return (
      <div className="customer-loading">
        <UtensilsCrossed size={40} />
        <h1>We couldn’t open this menu.</h1>
        <ErrorBox message={error} />
        <button
          className="button secondary"
          onClick={() => {
            setError("");
            void load();
          }}
        >
          Try again
        </button>
      </div>
    );
  const visitSettled =
    !!session && (session.status === "COMPLETED" || !!session.paidAt);
  const effectiveView =
    !session || (view === "welcome" && visitSettled)
      ? "welcome"
      : view === "welcome"
        ? "menu"
        : view;
  const filtered = items.filter(
    (i) =>
      (!veg || i.isVeg) &&
      (category === "All" ||
        (category === "Popular" ? i.isPopular : i.categoryId === category)) &&
      `${i.name} ${i.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const hasInvalid = cart.some(
    (i) => !items.find((m) => m.id === i.menuItemId)?.isAvailable,
  );
  return (
    <div
      className="customer-page"
      style={
        {
          "--restaurant-accent":
            restaurant.festivalTheme && restaurant.festivalTheme !== "none"
              ? festivalTheme(restaurant.festivalTheme).accent
              : restaurant.accentColor,
          background:
            restaurant.festivalTheme && restaurant.festivalTheme !== "none"
              ? festivalTheme(restaurant.festivalTheme).background
              : undefined,
        } as CSSProperties
      }
    >
      <div className="customer-frame">
        <FestivalBanner theme={restaurant.festivalTheme} />
        {effectiveView === "welcome" ? (
          <>
            <div
              className="welcome-cover"
              style={{
                backgroundImage: `linear-gradient(0deg, rgba(17,35,28,.6), transparent), url("${restaurant.bannerUrl.replace(/["\\\n\r]/g, "")}")`,
              }}
            >
              <span className="welcome-label">GOOD FOOD. GOOD COMPANY.</span>
            </div>
            <section className="welcome-body">
              <div className="restaurant-logo">
                {restaurant.logoUrl ? (
                  <img src={restaurant.logoUrl} alt={restaurant.name} />
                ) : (
                  <UtensilsCrossed size={31} />
                )}
              </div>
              <div className="eyebrow">WELCOME TO</div>
              <h1>{restaurant.name}</h1>
              <p>{restaurant.description}</p>
              <div
                className={`restaurant-open ${restaurant.orderingOpen ? "" : "closed"}`}
              >
                <i />
                {restaurant.orderingOpen
                  ? "Kitchen open · Freshly made, just for you"
                  : restaurant.orderingSuspended
                    ? "Online ordering temporarily unavailable"
                    : `Currently closed · Opens at ${restaurant.openingTime}`}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const s = await post<Session>("/public/sessions", {
                      restaurantSlug: slug,
                      customerName: name,
                    });
                    setSession(s);
                    router.push(`${base}/menu`);
                  });
                }}
              >
                <h2>What should we call you?</h2>
                <p>Just your name. We’ll take care of the rest.</p>
                <label className="sr-only" htmlFor="customer-name">
                  Your name
                </label>
                <input
                  id="customer-name"
                  autoComplete="given-name"
                  placeholder="Enter your name"
                  minLength={2}
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <p style={{ fontSize: 13, lineHeight: 1.6 }}>
                  Your name or nickname, order and payment choice are shared
                  with this restaurant to serve your visit.{" "}
                  <Link href="/legal/privacy" target="_blank">
                    Read the privacy notice
                  </Link>
                  . Prefer not to use online ordering? Order with staff.
                  Children should ask an adult to order using the adult’s
                  details.
                </p>
                <ErrorBox message={error} />
                <button
                  className="button customer-primary full"
                  disabled={busy}
                >
                  {busy ? "Welcoming you…" : "View menu"}
                  <ArrowRight size={18} />
                </button>
              </form>
              <div className="welcome-reassurance">
                <Check size={14} /> No signup <span>·</span>
                <Check size={14} /> Pay at the counter
              </div>
            </section>
            <CustomerFooter />
          </>
        ) : (
          <>
            <header className="customer-header">
              <Link href={`${base}/menu`} className="customer-brand">
                <span className="small-restaurant-logo">
                  {restaurant.logoUrl ? (
                    <img src={restaurant.logoUrl} alt="" />
                  ) : (
                    <UtensilsCrossed size={21} />
                  )}
                </span>
                <span>
                  {restaurant.name}
                  <small>Menu &amp; orders</small>
                </span>
              </Link>
              <Link
                href={`${base}/order`}
                className="customer-order-link"
                aria-label="Your orders"
              >
                <ReceiptText size={21} />
                {!!session?.orders.length && <b>{session.orders.length}</b>}
              </Link>
            </header>
            {!connected && (
              <div className="offline-notice">
                Reconnecting… your orders are safely saved.
              </div>
            )}
            {!restaurant.orderingOpen && (
              <div className="closed-notice">
                <Clock3 size={16} />
                <span>
                  {restaurant.orderingSuspended
                    ? "Online ordering is temporarily unavailable. Please contact the restaurant."
                    : restaurant.acceptingOrders
                      ? `Ordering from ${restaurant.openingTime}`
                      : "The kitchen has paused new orders"}
                </span>
              </div>
            )}
            <ErrorBox message={error} />
            {effectiveView === "menu" && visitSettled && (
              <div className="customer-info">
                Payment received. Ready to order again?
                <Link className="button customer-primary" href={base}>
                  Start a new visit
                </Link>
              </div>
            )}
            {effectiveView === "menu" && (
              <>
                <div className="menu-hero">
                  <div>
                    <span className="customer-greeting">
                      Hi {session?.customerName} <span>👋</span>
                    </span>
                    <h1>What would you like?</h1>
                    <p>Choose your dishes. Pay at the counter.</p>
                  </div>
                  <div className="hero-food">
                    {items.some((i) => i.imageUrl) || restaurant.bannerUrl ? (
                      <img
                        src={
                          items.find((i) => i.name.includes("Biryani"))
                            ?.imageUrl ||
                          items.find((i) => i.imageUrl)?.imageUrl ||
                          restaurant.bannerUrl
                        }
                        alt="Freshly prepared food"
                      />
                    ) : (
                      <UtensilsCrossed size={64} aria-hidden="true" />
                    )}
                    <span>
                      <Heart size={12} /> Made fresh
                    </span>
                  </div>
                </div>
                <div className="customer-search">
                  <Search size={19} />
                  <input
                    placeholder="Find your next favourite…"
                    aria-label="Search dishes"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="customer-categories">
                  {[
                    { id: "All", name: "All dishes" },
                    { id: "Popular", name: "Popular" },
                    ...categories,
                  ].map((c) => (
                    <button
                      key={c.id}
                      className={category === c.id ? "active" : ""}
                      onClick={() => setCategory(c.id)}
                    >
                      {c.id === "Popular" && <Flame size={14} />} {c.name}
                    </button>
                  ))}
                </div>
                <div className="customer-menu-heading">
                  <h2>
                    {query
                      ? "Something for your craving"
                      : category === "All"
                        ? "Made to make your day"
                        : category === "Popular"
                          ? "The crowd favourites"
                          : categories.find((c) => c.id === category)?.name}
                  </h2>
                  <label className="veg-filter">
                    <input
                      type="checkbox"
                      checked={veg}
                      onChange={(e) => setVeg(e.target.checked)}
                    />
                    <Leaf size={14} /> Veg only
                  </label>
                </div>
                <div className="customer-dishes">
                  {filtered.map((item) => {
                    const quantity =
                      cart.find((i) => i.menuItemId === item.id)?.quantity || 0;
                    return (
                      <article
                        className={`customer-dish ${!item.isAvailable ? "unavailable" : ""}`}
                        key={item.id}
                      >
                        <div className="customer-dish-details">
                          <div className="dish-labels">
                            <span
                              className={`veg-symbol ${item.isVeg ? "" : "nonveg"}`}
                              aria-label={
                                item.isVeg ? "Vegetarian" : "Non-vegetarian"
                              }
                            >
                              <i />
                            </span>
                            {item.isPopular && (
                              <span className="bestseller">
                                <Flame size={11} /> BESTSELLER
                              </span>
                            )}
                          </div>
                          <h3>{item.name}</h3>
                          <p>{item.description}</p>
                          <strong>{fmt(item.price)}</strong>
                          {item.preparationTime && (
                            <small className="prep-time">
                              <Clock3 size={11} />
                              {item.preparationTime} min
                            </small>
                          )}
                        </div>
                        <div className="customer-dish-photo">
                          <FoodImage src={item.imageUrl} alt={item.name} />
                          {!item.isAvailable ? (
                            <span className="sold-out-label">SOLD OUT</span>
                          ) : quantity ? (
                            <div className="quantity-control">
                              <button
                                aria-label={`Remove one ${item.name}`}
                                onClick={() => add(item, -1)}
                              >
                                <Minus size={15} />
                              </button>
                              <b>{quantity}</b>
                              <button
                                aria-label={`Add one ${item.name}`}
                                disabled={!orderingAllowed || quantity >= 20}
                                onClick={() => add(item, 1)}
                              >
                                <Plus size={15} />
                              </button>
                            </div>
                          ) : (
                            <button
                              className="add-button"
                              disabled={!orderingAllowed}
                              onClick={() => add(item, 1)}
                              aria-label={`Add ${item.name}`}
                            >
                              <Plus size={15} /> ADD
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!filtered.length && (
                  <Empty
                    icon={<Search size={28} />}
                    title="No dishes found"
                    text="Try another search or category."
                  />
                )}
                {session?.status === "BILL_REQUESTED" && !session.paidAt && (
                  <div className="customer-info">
                    Your bill has been requested. Please visit the counter when
                    you’re ready.
                  </div>
                )}
                <div className="menu-bottom">
                  <UtensilsCrossed size={22} />
                  <h3>Good food takes a little love.</h3>
                  <p>Prepared fresh. Served with a smile.</p>
                  {restaurant.address && (
                    <span>
                      <MapPin size={12} />
                      {restaurant.address}
                    </span>
                  )}
                </div>
                <CustomerFooter slug={slug} />
                {count > 0 && (
                  <Link href={`${base}/cart`} className="sticky-cart">
                    <span className="cart-count">{count}</span>
                    <span>
                      <strong>{fmt(total)}</strong>
                      <small>Pay at the counter</small>
                    </span>
                    <b>
                      View cart <ArrowRight size={18} />
                    </b>
                  </Link>
                )}
              </>
            )}
            {effectiveView === "cart" && (
              <section className="customer-inner">
                <Link href={`${base}/menu`} className="back-link">
                  <ArrowLeft size={17} /> Back to the menu
                </Link>
                <div className="eyebrow">
                  GOOD CHOICES, {session?.customerName.toUpperCase()}
                </div>
                <h1>Your little feast.</h1>
                <p className="muted">
                  Freshly prepared, just the way you like it.
                </p>
                {!cart.length ? (
                  <>
                    <Empty
                      icon={<ShoppingBag size={34} />}
                      title="Something delicious is missing"
                      text="Add your favourites from the menu to get started."
                    />
                    <Link
                      href={`${base}/menu`}
                      className="button customer-primary full"
                    >
                      Explore the menu <ArrowRight size={17} />
                    </Link>
                  </>
                ) : (
                  <>
                    <div className="cart-lines">
                      {cart.map((line) => {
                        const item = items.find(
                          (i) => i.id === line.menuItemId,
                        );
                        return (
                          <div className="cart-line" key={line.menuItemId}>
                            <div className="cart-line-top">
                              <span>
                                <span
                                  className={`veg-symbol ${item?.isVeg ? "" : "nonveg"}`}
                                >
                                  <i />
                                </span>
                                <strong>
                                  {item?.name || "Item no longer available"}
                                </strong>
                                <small>
                                  {item?.isAvailable
                                    ? fmt(item.price) + " each"
                                    : "Sold out — please remove"}
                                </small>
                              </span>
                              <strong>
                                {fmt(Number(item?.price || 0) * line.quantity)}
                              </strong>
                            </div>
                            <div className="cart-line-bottom">
                              <input
                                placeholder="Any special instructions?"
                                aria-label={`Instructions for ${item?.name || "item"}`}
                                maxLength={200}
                                value={line.notes}
                                onChange={(e) =>
                                  saveCart(
                                    cart.map((i) =>
                                      i.menuItemId === line.menuItemId
                                        ? { ...i, notes: e.target.value }
                                        : i,
                                    ),
                                  )
                                }
                              />
                              <div className="quantity-control">
                                <button
                                  aria-label={`Remove one ${item?.name}`}
                                  onClick={() => {
                                    if (item) add(item, -1);
                                    else
                                      saveCart(
                                        cart.filter(
                                          (i) =>
                                            i.menuItemId !== line.menuItemId,
                                        ),
                                      );
                                  }}
                                >
                                  <Minus size={14} />
                                </button>
                                <b>{line.quantity}</b>
                                <button
                                  aria-label={`Add one ${item?.name}`}
                                  disabled={
                                    !item?.isAvailable ||
                                    line.quantity >= 20 ||
                                    !orderingAllowed
                                  }
                                  onClick={() => item && add(item, 1)}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Link className="add-more-link" href={`${base}/menu`}>
                      <Plus size={16} /> Add more items
                    </Link>
                    <label className="order-note-label">
                      A note for the kitchen
                      <textarea
                        maxLength={300}
                        placeholder="Anything else we should know?"
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <div className="cart-totals">
                      <div>
                        <span>Subtotal</span>
                        <strong>{fmt(total)}</strong>
                      </div>
                      <p>Pay at the counter after your meal.</p>
                    </div>
                    {hasInvalid && (
                      <ErrorBox message="An item is no longer available. Please remove it before ordering." />
                    )}
                    {visitSettled && (
                      <div className="customer-info">
                        This visit is settled.{" "}
                        <Link href={base}>Start a new visit →</Link>
                      </div>
                    )}
                    <button
                      className="button customer-primary full place-order"
                      disabled={busy || !orderingAllowed || hasInvalid}
                      onClick={() => {
                        if (submitting.current) return;
                        submitting.current = true;
                        void action(async () => {
                          const body = {
                            restaurantSlug: slug,
                            items: cart,
                            customerNote: note,
                          };
                          const signature = JSON.stringify(body);
                          let idempotencyKey =
                            pendingSubmission.current?.signature === signature
                              ? pendingSubmission.current.key
                              : crypto.randomUUID();
                          try {
                            const stored = JSON.parse(
                              localStorage.getItem(
                                `submission:${session!.id}`,
                              ) || "null",
                            );
                            if (stored?.signature === signature)
                              idempotencyKey = stored.key;
                            else
                              localStorage.setItem(
                                `submission:${session!.id}`,
                                JSON.stringify({
                                  signature,
                                  key: idempotencyKey,
                                }),
                              );
                          } catch {
                            /* The in-memory key preserves retries if browser storage is unavailable. */
                          }
                          pendingSubmission.current = {
                            signature,
                            key: idempotencyKey,
                          };
                          await post("/public/orders", {
                            ...body,
                            idempotencyKey,
                          });
                          saveCart([]);
                          setNote("");
                          try {
                            localStorage.removeItem(
                              `submission:${session!.id}`,
                            );
                          } catch {}
                          pendingSubmission.current = null;
                          await load();
                          router.push(`${base}/order`);
                        }).finally(() => {
                          submitting.current = false;
                        });
                      }}
                    >
                      {busy ? "Sending to the kitchen…" : "Place order"}
                      <span>
                        {fmt(total)} <ArrowRight size={18} />
                      </span>
                    </button>
                    <div className="order-promise">
                      <Check size={14} /> No payment needed now. Just enjoy.
                    </div>
                  </>
                )}
              </section>
            )}
            {effectiveView === "order" && (
              <section className="customer-inner tracking">
                <Link href={`${base}/menu`} className="back-link">
                  <ArrowLeft size={17} /> Back to the menu
                </Link>
                {session?.orders.length ? (
                  <>
                    <div className="confirmation-icon">
                      <CheckCircle2 size={32} />
                    </div>
                    <h1>
                      {session.status === "COMPLETED"
                        ? `See you soon, ${session.customerName}!`
                        : `Thanks, ${session.customerName}!`}
                    </h1>
                    <p className="muted">
                      {session.status === "COMPLETED"
                        ? "Your visit is complete. Thanks for sharing a meal with us."
                        : "Your order is with our kitchen. We’ll keep you posted."}
                    </p>
                    <div className="tracking-orders">
                      {[...session.orders].reverse().map((o) => {
                        const stages = ["Received", "Preparing", "Completed"];
                        const current =
                          o.status === "COMPLETED"
                            ? 2
                            : ["PREPARING", "READY", "SERVED"].includes(
                                  o.status,
                                )
                              ? 1
                              : 0;
                        return (
                          <article
                            key={o.id}
                            className={`tracking-card ${o.status === "READY" ? "ready" : ""}`}
                          >
                            <div className="tracking-card-heading">
                              <strong>Order #{o.orderNumber}</strong>
                              <span>{fmt(o.subtotal)}</span>
                            </div>
                            {o.status === "READY" && (
                              <div className="ready-message" role="status">
                                <Sparkles size={27} />
                                <h2>Your order is ready!</h2>
                                <strong>
                                  {session.customerName} — Order #
                                  {o.orderNumber}
                                </strong>
                                <p>Your order will be with you shortly.</p>
                              </div>
                            )}
                            {o.status === "CANCELLED" ? (
                              <div className="cancelled-message">
                                This order was cancelled and removed from your
                                bill.
                              </div>
                            ) : (
                              <div
                                className="order-progress"
                                aria-label={`Order ${o.orderNumber} status: ${stages[current].toLowerCase()}`}
                              >
                                {stages.map((stage, i) => (
                                  <div
                                    key={stage}
                                    className={i <= current ? "done" : ""}
                                  >
                                    <span>
                                      {i < current || current === 2 ? (
                                        <Check size={13} />
                                      ) : i === current ? (
                                        <i />
                                      ) : null}
                                    </span>
                                    <small>{stage}</small>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="tracking-items">
                              {o.items.map((i) => (
                                <div key={i.id}>
                                  <span>
                                    {i.quantity} × {i.itemNameSnapshot}
                                    {i.notes && <small>{i.notes}</small>}
                                  </span>
                                  <span>{fmt(i.total)}</span>
                                </div>
                              ))}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="session-summary">
                      <span>
                        Your visit total
                        <small>
                          {session.orders.length} orders ·{" "}
                          {session.customerName}
                        </small>
                      </span>
                      <strong>{fmt(session.total)}</strong>
                    </div>
                    {session.paidAt && (
                      <div
                        className="customer-info"
                        style={{ flexDirection: "column" }}
                      >
                        <span>
                          <CheckCircle2 size={20} /> Payment received at the
                          counter
                          {session.paymentMethod
                            ? ` · ${session.paymentMethod === "CASH" ? "Cash" : "UPI"}`
                            : ""}
                          . Thank you!
                        </span>
                        <a
                          className="button customer-primary full"
                          href={`/api/public/sessions/current/receipt?slug=${encodeURIComponent(slug)}`}
                          download="payment-receipt.html"
                        >
                          Download receipt
                        </a>
                        <small>
                          Printable receipt · Download before starting a new
                          visit.
                        </small>
                      </div>
                    )}
                    {session.status === "ACTIVE" && !session.paidAt && (
                      <>
                        <Link
                          href={`${base}/menu`}
                          className="button customer-primary full"
                        >
                          <Plus size={17} /> Add more food
                        </Link>
                        <button
                          className="button secondary full"
                          onClick={() => setBillDialog(true)}
                        >
                          <ReceiptText size={17} /> Request bill
                        </button>
                      </>
                    )}
                    {session.status === "BILL_REQUESTED" && !session.paidAt && (
                      <div className="customer-info">
                        <ReceiptText size={22} />
                        <span>
                          <strong>Bill requested.</strong>
                          {session.paymentMethod && (
                            <span>
                              {" "}
                              Payment:{" "}
                              {session.paymentMethod === "CASH"
                                ? "Cash"
                                : "UPI"}
                              .
                            </span>
                          )}
                          <br />
                          Please visit the counter when you’re ready.
                        </span>
                      </div>
                    )}
                    {visitSettled && (
                      <Link
                        href={base}
                        className="button customer-primary full"
                      >
                        Start a new visit <ArrowRight size={17} />
                      </Link>
                    )}
                    {session.status !== "COMPLETED" && (
                      <button
                        className="help-button"
                        disabled={busy}
                        onClick={() =>
                          action(async () => {
                            await post("/public/service-requests", {
                              restaurantSlug: slug,
                              type: "NEED_HELP",
                            });
                            setToast("Your restaurant team has been notified.");
                          })
                        }
                      >
                        Need a hand? Let us know
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <Empty
                      icon={<ReceiptText size={34} />}
                      title="Your next great meal is waiting"
                      text="Once you order, you can follow it right here."
                    />
                    <Link
                      href={`${base}/menu`}
                      className="button customer-primary full"
                    >
                      Explore the menu
                    </Link>
                  </>
                )}
                <CustomerFooter slug={slug} />
              </section>
            )}
          </>
        )}
        {toast && (
          <div className="customer-toast" role="status">
            <CheckCircle2 size={19} />
            {toast}
          </div>
        )}
        {billDialog && (
          <Modal
            title="Request your bill?"
            onClose={() => setBillDialog(false)}
          >
            <p className="muted">
              Ready to wrap up? Your total is{" "}
              <strong>{fmt(session?.total || 0)}</strong>. Pay at the counter
              when you’re ready. New orders will be paused for this visit.
            </p>
            <fieldset className="payment-choice">
              <legend>How would you like to pay?</legend>
              {(["UPI", "CASH"] as const).map((method) => (
                <label key={method}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method}
                    checked={paymentMethod === method}
                    onChange={() => setPaymentMethod(method)}
                  />
                  {method === "CASH" ? "Cash" : "UPI"}
                </label>
              ))}
              <p>
                Pay at the counter. Your receipt unlocks after staff confirms
                payment.
              </p>
            </fieldset>
            <ErrorBox message={error} />
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setBillDialog(false)}
              >
                Not yet
              </button>
              <button
                className="button customer-primary"
                disabled={busy || !paymentMethod}
                onClick={() =>
                  action(async () => {
                    await post("/public/service-requests", {
                      restaurantSlug: slug,
                      type: "REQUEST_BILL",
                      paymentMethod,
                    });
                    await load();
                    setBillDialog(false);
                  })
                }
              >
                Request bill <ArrowRight size={16} />
              </button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
function CustomerFooter({ slug }: { slug?: string }) {
  return (
    <footer className="customer-footer">
      <LegalLinks />
      {slug && (
        <a
          href={`/api/public/sessions/current/export?slug=${encodeURIComponent(slug)}`}
          download
        >
          Download my visit information
        </a>
      )}
      <span>A little technology. A lot of hospitality.</span>
      <span>
        Powered by <b>TableBabu</b>
      </span>
    </footer>
  );
}
