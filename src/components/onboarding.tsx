"use client";
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
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Eye,
  ImagePlus,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Palette,
  Plus,
  QrCode,
  Rocket,
  Save,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  UtensilsCrossed,
} from "lucide-react";
import { api, ApiError, money, patch, post } from "@/lib/client";
import {
  currencies,
  draftSchema,
  setupIssues,
  slugify,
  slugSchema,
  timezones,
  type OnboardingDraft,
  type OnboardingState,
  type SetupIssue,
} from "@/lib/onboarding";
import { Brand, ErrorBox, FoodImage, Modal, Spinner } from "./ui";

const steps = [
  {
    title: "Your restaurant",
    description: "The name behind the welcome",
    icon: Store,
  },
  {
    title: "Brand & hours",
    description: "Make it feel like you",
    icon: Palette,
  },
  {
    title: "Build your menu",
    description: "Give guests something to love",
    icon: UtensilsCrossed,
  },
  {
    title: "Review & launch",
    description: "One last look. Then you’re live.",
    icon: Rocket,
  },
];
type SaveStatus = "saved" | "saving" | "unsaved" | "error" | "conflict";
export default function Onboarding({ restaurantId }: { restaurantId: string }) {
  const base = `/onboarding?onboardingRestaurant=${encodeURIComponent(restaurantId)}`;
  const router = useRouter();
  const [state, setState] = useState<OnboardingState>();
  const [draft, setDraft] = useState<OnboardingDraft>();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<SetupIssue[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [slugStatus, setSlugStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [preview, setPreview] = useState(false);
  const [launched, setLaunched] = useState<{ name: string; menuUrl: string }>();
  const [copied, setCopied] = useState(false);
  const [uploads, setUploads] = useState(0);
  const draftRef = useRef<OnboardingDraft | undefined>(undefined);
  const version = useRef(0);
  const stepRef = useRef(1);
  const statusRef = useRef<SaveStatus>("saved");
  const busyRef = useRef(false);
  const persisted = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const slugEdited = useRef(false);
  const top = useRef<HTMLHeadingElement>(null);
  const status = (s: SaveStatus) => {
    statusRef.current = s;
    setSaveStatus(s);
  };
  const load = useCallback(async () => {
    try {
      const data = await api<OnboardingState>(base);
      setState(data);
      setDraft(data.draft);
      draftRef.current = data.draft;
      setStep(data.currentStep);
      stepRef.current = data.currentStep;
      version.current = data.version;
      slugEdited.current = !!data.draft.details.slug;
      persisted.current = JSON.stringify({
        draft: data.draft,
        currentStep: data.currentStep,
      });
      status("saved");
      setError("");
      setIssues([]);
      if (data.completedAt)
        setLaunched({ name: data.restaurant.name, menuUrl: data.menuUrl });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace("/login");
      else setError((e as Error).message);
    }
  }, [router, base]);
  useEffect(() => {
    void load();
  }, [load]);
  const persist = useCallback(
    (targetStep?: number): Promise<boolean> => {
      clearTimeout(timer.current);
      let success = false;
      const operation = async () => {
        if (!draftRef.current || statusRef.current === "conflict") return;
        const snapshot = draftRef.current;
        const currentStep = targetStep ?? stepRef.current;
        const signature = JSON.stringify({ draft: snapshot, currentStep });
        if (signature === persisted.current) {
          success = true;
          return;
        }
        status("saving");
        try {
          const result = await patch<{ version: number; updatedAt: string }>(
            `/onboarding/draft?onboardingRestaurant=${encodeURIComponent(restaurantId)}`,
            { draft: snapshot, currentStep, version: version.current },
          );
          version.current = result.version;
          persisted.current = signature;
          status(draftRef.current === snapshot ? "saved" : "unsaved");
          success = true;
          setError("");
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            router.replace("/login");
            return;
          }
          if (
            e instanceof ApiError &&
            e.status === 409 &&
            !e.message.includes("URL")
          ) {
            try {
              const remote = await api<OnboardingState>(base);
              if (
                JSON.stringify({
                  draft: remote.draft,
                  currentStep: remote.currentStep,
                }) === signature
              ) {
                version.current = remote.version;
                persisted.current = signature;
                status("saved");
                success = true;
                return;
              }
            } catch {}
            status("conflict");
          } else status("error");
          setError((e as Error).message);
        }
      };
      queue.current = queue.current.catch(() => {}).then(operation);
      return queue.current.then(() => success);
    },
    [router, base, restaurantId],
  );
  useEffect(() => {
    if (
      !draft ||
      launched ||
      busyRef.current ||
      statusRef.current === "conflict"
    )
      return;
    if (
      JSON.stringify({ draft, currentStep: stepRef.current }) ===
      persisted.current
    )
      return;
    timer.current = setTimeout(() => {
      void persist();
    }, 800);
    return () => clearTimeout(timer.current);
  }, [draft, launched, persist]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (statusRef.current !== "saved" && !launched) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const online = () => {
      if (statusRef.current === "error") void persist();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", online);
    };
  }, [launched, persist]);
  useEffect(() => {
    if (!draft || step !== 1) return;
    const parsed = slugSchema.safeParse(draft.details.slug);
    if (!parsed.success) {
      setSlugStatus(draft.details.slug ? "invalid" : "idle");
      return;
    }
    setSlugStatus("checking");
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void api<{ available: boolean }>(
        `/onboarding/slug?onboardingRestaurant=${encodeURIComponent(restaurantId)}&slug=${encodeURIComponent(parsed.data)}`,
        { signal: controller.signal },
      )
        .then((result) =>
          setSlugStatus(result.available ? "available" : "taken"),
        )
        .catch((e) => {
          if ((e as Error).name !== "AbortError") setSlugStatus("idle");
        });
    }, 400);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [draft?.details.slug, step]);
  const change = (next: OnboardingDraft) => {
    draftRef.current = next;
    setDraft(next);
    if (statusRef.current !== "conflict") status("unsaved");
    setIssues([]);
  };
  const navigate = async (target: number) => {
    if (!draftRef.current || busyRef.current || uploads) return;
    setError("");
    if (target > step) {
      const errors = setupIssues(draftRef.current, target - 1);
      if (errors.length) {
        setIssues(errors);
        top.current?.focus();
        return;
      }
      if (step === 1 && slugStatus === "taken") {
        setIssues([
          {
            field: "details.slug",
            message:
              "This URL is already taken. Try adding your city or a distinctive name.",
            step: 1,
          },
        ]);
        return;
      }
    }
    busyRef.current = true;
    setBusy(true);
    const saved = await persist(target);
    if (saved) {
      stepRef.current = target;
      setStep(target);
      setIssues([]);
      window.scrollTo({ top: 0, behavior: "instant" });
      setTimeout(() => top.current?.focus(), 0);
    }
    busyRef.current = false;
    setBusy(false);
  };
  const saveExit = async () => {
    if (busyRef.current || uploads) return;
    busyRef.current = true;
    setBusy(true);
    if (await persist()) {
      try {
        window.location.replace("/control-room");
        return;
      } catch (e) {
        setError((e as Error).message);
      }
    }
    busyRef.current = false;
    setBusy(false);
  };
  const launch = async () => {
    if (!draftRef.current || busyRef.current || uploads) return;
    const errors = setupIssues(draftRef.current);
    if (errors.length) {
      setIssues(errors);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (!(await persist(4))) return;
      const result = await post<{ name: string; menuUrl: string }>(
        `/onboarding/launch?onboardingRestaurant=${encodeURIComponent(restaurantId)}`,
        { version: version.current },
      );
      status("saved");
      setLaunched(result);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const fieldError = (name: string) =>
    issues.find((i) => i.field === name)?.message;
  const uploading = (value: boolean) =>
    setUploads((n) => Math.max(0, n + (value ? 1 : -1)));
  if (!draft || !state)
    return (
      <div className="app-loading">
        <Brand />
        <Spinner />
        <ErrorBox message={error} />
        {error && (
          <button className="button secondary" onClick={() => void load()}>
            Try again
          </button>
        )}
      </div>
    );
  const menuUrl = `${state.menuUrl.split("/r/")[0]}/r/${draft.details.slug || "your-restaurant"}`;
  const dishCount = draft.categories.reduce((n, c) => n + c.items.length, 0);
  const updateDetails = (values: Partial<OnboardingDraft["details"]>) => {
    const current = draftRef.current!;
    change({ ...current, details: { ...current.details, ...values } });
  };
  const updateBrand = (values: Partial<OnboardingDraft["brand"]>) => {
    const current = draftRef.current!;
    change({ ...current, brand: { ...current.brand, ...values } });
  };
  const editCategory = (
    id: string,
    transform: (
      c: OnboardingDraft["categories"][number],
    ) => OnboardingDraft["categories"][number],
  ) => {
    const current = draftRef.current!;
    change({
      ...current,
      categories: current.categories.map((c) =>
        c.id === id ? transform(c) : c,
      ),
    });
  };
  const addDish = (id: string) =>
    editCategory(id, (c) => ({
      ...c,
      items: [
        ...c.items,
        {
          id: crypto.randomUUID(),
          name: "",
          description: "",
          price: "",
          imageUrl: "",
          isVeg: true,
          isPopular: false,
        },
      ],
    }));
  const canAct = !busy && !uploads && saveStatus !== "conflict";
  return (
    <div className="onboarding-shell">
      <aside className="setup-sidebar">
        <Link href="/control-room">
          <Brand />
        </Link>
        <div className="setup-sidebar-title">
          <span className="eyebrow">RESTAURANT SETUP</span>
          <h2>
            Let’s bring your
            <br />
            restaurant online.
          </h2>
          <p>
            A few thoughtful details.
            <br />A better experience for every guest.
          </p>
        </div>
        <nav aria-label="Setup steps">
          <div className="setup-account-step">
            <span>
              <Check size={16} />
            </span>
            <div>
              <strong>Owner account</strong>
              <small>Managed by the platform administrator.</small>
            </div>
          </div>
          {steps.map((s, index) => (
            <button
              key={s.title}
              className={`setup-step ${index + 1 === step && !launched ? "current" : ""} ${index + 1 < step || launched ? "complete" : ""}`}
              disabled={
                !!launched ||
                !canAct ||
                (index + 1 > step && setupIssues(draft, index).length > 0)
              }
              onClick={() => void navigate(index + 1)}
              aria-current={index + 1 === step ? "step" : undefined}
            >
              <span>
                {index + 1 < step || launched ? (
                  <Check size={16} />
                ) : (
                  String(index + 2).padStart(2, "0")
                )}
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.description}</small>
              </div>
              {index + 1 === step && !launched && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="setup-sidebar-bottom">
          <div className="setup-progress-copy">
            <span>Your setup</span>
            <strong>{launched ? 100 : step * 20}% complete</strong>
          </div>
          <progress value={launched ? 100 : step * 20} max={100} />
          <div className="setup-owner">
            <span className="user-avatar">{state.user.name[0]}</span>
            <div>
              <strong>{state.user.name}</strong>
              <small>{state.user.email}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="setup-workspace">
        <header className="setup-header">
          <div>
            <span className="setup-mobile-brand">
              <Brand small />
            </span>
            <span className="setup-header-label">
              Restaurant setup <span>/</span>{" "}
              {launched ? "You’re live" : steps[step - 1].title}
            </span>
          </div>
          <div className="setup-header-actions">
            {!launched && (
              <span className={`save-status ${saveStatus}`} role="status">
                {saveStatus === "saving" ? (
                  <LoaderCircle size={13} className="spin" />
                ) : saveStatus === "saved" ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <Save size={13} />
                )}
                <span>
                  {saveStatus === "saved"
                    ? "All changes saved"
                    : saveStatus === "saving"
                      ? "Saving…"
                      : saveStatus === "conflict"
                        ? "Conflicting changes"
                        : saveStatus === "error"
                          ? "Not saved"
                          : "Unsaved changes"}
                </span>
              </span>
            )}
            {!launched ? (
              <button
                className="button secondary"
                disabled={!canAct}
                onClick={() => void saveExit()}
              >
                <LogOut size={14} /> Save & exit
              </button>
            ) : (
              <Link className="button secondary" href="/control-room">
                Go to workspace <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </header>
        <main
          className={`setup-content ${step === 3 ? "menu-step-content" : ""}`}
        >
          {launched ? (
            <section className="launch-success">
              <span className="launch-success-icon">
                <CheckCircle2 size={42} />
              </span>
              <div className="eyebrow">THE NEXT ORDER IS YOURS</div>
              <h1>You’re ready to welcome guests.</h1>
              <p>
                <strong>{launched.name}</strong> now has its own digital menu.
                <br />
                Put your QR where guests can see it. We’ll take it from there.
              </p>
              <div className="launch-qr">
                <img
                  src={`/api/qr?onboardingRestaurant=${encodeURIComponent(restaurantId)}`}
                  alt={`Restaurant QR for ${launched.name}`}
                  width={200}
                  height={200}
                />
                <h2>Scan. Order. Enjoy.</h2>
                <span>{launched.name}</span>
              </div>
              <div className="launch-url">
                <span>{launched.menuUrl}</span>
                <button
                  className="icon-button"
                  aria-label="Copy menu link"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(launched.menuUrl);
                      setCopied(true);
                    } catch {
                      setError("Copy the menu address shown above.");
                    }
                  }}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              <div className="button-group">
                <a
                  className="button secondary"
                  href={`/api/qr?download=1&onboardingRestaurant=${encodeURIComponent(restaurantId)}`}
                  download
                >
                  <Download size={16} /> Download QR
                </a>
                <a
                  className="button secondary"
                  href={launched.menuUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open your menu <ExternalLink size={15} />
                </a>
              </div>
              <Link
                href="/control-room"
                className="button primary launch-dashboard"
              >
                Return to restaurants <ArrowRight size={17} />
              </Link>
              <div className="launch-next-steps">
                <div>
                  <span>01</span>
                  <strong>Display your QR</strong>
                  <p>The same code works across your restaurant.</p>
                </div>
                <div>
                  <span>02</span>
                  <strong>Keep your dashboard open</strong>
                  <p>Enable the bell for new-order sounds.</p>
                </div>
                <div>
                  <span>03</span>
                  <strong>Make someone’s day</strong>
                  <p>Accept, prepare, and call their name.</p>
                </div>
              </div>
              <ErrorBox message={error} />
            </section>
          ) : (
            <>
              <div className="setup-page-heading">
                <div className="setup-kicker">
                  <span>{String(step + 1).padStart(2, "0")}</span> STEP{" "}
                  {String(step + 1).padStart(2, "0")} OF 05
                </div>
                <h1 ref={top} tabIndex={-1}>
                  {
                    [
                      "First, the place behind the plate.",
                      "A menu that feels like you.",
                      "What’s cooking?",
                      "A final look before your first order.",
                    ][step - 1]
                  }
                </h1>
                <p>
                  {
                    [
                      "Tell us a little about your restaurant. This is how guests will find you.",
                      "Bring your personality to the screen, and set the rhythm of your kitchen.",
                      "Start with your favourites. You can keep growing your menu after launch.",
                      "Check the details, preview your menu, and open your doors to digital ordering.",
                    ][step - 1]
                  }
                </p>
              </div>
              <div
                className="setup-mobile-progress"
                aria-label={`Setup step ${step + 1} of 5`}
              >
                {steps.map((s, i) => (
                  <span key={s.title} className={i + 1 <= step ? "done" : ""} />
                ))}
              </div>
              <ErrorBox message={error} />
              {saveStatus === "conflict" && (
                <div className="setup-recovery">
                  <p>
                    Your changes are still on this screen. Reloading replaces
                    them with the latest saved version.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => void load()}
                  >
                    Reload saved version
                  </button>
                </div>
              )}
              {saveStatus === "error" && (
                <button
                  className="text-link setup-retry"
                  onClick={() => void persist()}
                >
                  Retry saving your changes <ArrowRight size={14} />
                </button>
              )}
              {!!issues.length && (
                <div className="setup-validation" role="alert">
                  <strong>A couple of details need a second look.</strong>
                  <ul>
                    {issues.slice(0, 5).map((i) => (
                      <li key={i.field}>{i.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {step === 1 && (
                <div className="setup-form-layout">
                  <section className="setup-panel">
                    <div className="setup-panel-heading">
                      <span>
                        <Store size={20} />
                      </span>
                      <div>
                        <h2>The essentials</h2>
                        <p>Your guests’ first introduction.</p>
                      </div>
                    </div>
                    <div className="setup-fields">
                      <label>
                        Restaurant name
                        <input
                          value={draft.details.name}
                          placeholder="e.g. Bengal Bistro"
                          maxLength={80}
                          autoComplete="organization"
                          onChange={(e) => {
                            const name = e.target.value;
                            updateDetails({
                              name,
                              ...(!slugEdited.current
                                ? { slug: slugify(name) }
                                : {}),
                            });
                          }}
                          aria-invalid={!!fieldError("details.name")}
                        />
                      </label>
                      <label>
                        Your menu address
                        <div
                          className={`slug-input ${slugStatus === "taken" ? "invalid" : ""}`}
                        >
                          <span>/r/</span>
                          <input
                            value={draft.details.slug}
                            placeholder="bengal-bistro"
                            maxLength={60}
                            autoCapitalize="none"
                            spellCheck={false}
                            onChange={(e) => {
                              slugEdited.current = true;
                              updateDetails({
                                slug: e.target.value.toLowerCase(),
                              });
                            }}
                            aria-invalid={
                              slugStatus === "taken" ||
                              !!fieldError("details.slug")
                            }
                          />
                          {slugStatus === "checking" ? (
                            <LoaderCircle size={16} className="spin" />
                          ) : slugStatus === "available" ? (
                            <CheckCircle2 size={16} />
                          ) : null}
                        </div>
                        <span
                          className={`field-hint ${slugStatus === "available" ? "positive" : slugStatus === "taken" ? "negative" : ""}`}
                          role="status"
                        >
                          {slugStatus === "available"
                            ? "Available — it’s a good fit."
                            : slugStatus === "taken"
                              ? "Already taken. Try adding your city."
                              : slugStatus === "invalid"
                                ? "Use 3–60 lowercase letters, numbers, and hyphens."
                                : "A memorable address for your restaurant’s menu."}
                        </span>
                      </label>
                      <label>
                        Restaurant address
                        <textarea
                          value={draft.details.address}
                          placeholder="Street address, city, postal code"
                          rows={2}
                          maxLength={250}
                          autoComplete="street-address"
                          onChange={(e) =>
                            updateDetails({ address: e.target.value })
                          }
                          aria-invalid={!!fieldError("details.address")}
                        />
                      </label>
                      <label>
                        Contact number{" "}
                        <span className="optional">Optional</span>
                        <input
                          value={draft.details.phone}
                          type="tel"
                          placeholder="+91 98765 43210"
                          maxLength={30}
                          autoComplete="tel"
                          onChange={(e) =>
                            updateDetails({ phone: e.target.value })
                          }
                        />
                      </label>
                      <div className="form-grid">
                        <label>
                          Currency
                          <select
                            value={draft.details.currency}
                            onChange={(e) =>
                              updateDetails({
                                currency: e.target
                                  .value as OnboardingDraft["details"]["currency"],
                              })
                            }
                          >
                            {currencies.map((c) => (
                              <option key={c} value={c}>
                                {
                                  {
                                    INR: "INR — Indian rupee",
                                    USD: "USD — US dollar",
                                    GBP: "GBP — British pound",
                                    EUR: "EUR — Euro",
                                    AED: "AED — UAE dirham",
                                  }[c]
                                }
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Time zone
                          <select value={draft.details.timezone} disabled>
                            {timezones.map((t) => (
                              <option key={t} value={t}>
                                IST (UTC+05:30)
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="field-hint">
                        Currency applies to every price in your menu. Your time
                        zone keeps opening hours and reports accurate.
                      </p>
                    </div>
                  </section>
                  <aside className="setup-advice">
                    <div className="advice-illustration">
                      <QrCode size={68} />
                      <span>
                        <Check size={14} /> Yours, everywhere
                      </span>
                    </div>
                    <h3>
                      One address.
                      <br />
                      Every hungry guest.
                    </h3>
                    <p>
                      Your QR opens this same menu from a table, the entrance,
                      or your counter.
                    </p>
                    <div className="menu-url-sample">{menuUrl}</div>
                    <div className="setup-private-note">
                      <LockKeyhole size={17} />
                      <span>
                        Nothing is public yet.
                        <br />
                        You choose when to launch.
                      </span>
                    </div>
                  </aside>
                </div>
              )}
              {step === 2 && (
                <div className="setup-brand-layout">
                  <section className="setup-panel">
                    <div className="setup-panel-heading">
                      <span>
                        <Palette size={20} />
                      </span>
                      <div>
                        <h2>Your look & feel</h2>
                        <p>A little personality goes a long way.</p>
                      </div>
                    </div>
                    <div className="setup-fields">
                      <SetupImage
                        restaurantId={restaurantId}
                        label="Restaurant logo"
                        value={draft.brand.logoUrl}
                        onChange={(logoUrl) => updateBrand({ logoUrl })}
                        onBusy={uploading}
                      />
                      <SetupImage
                        restaurantId={restaurantId}
                        label="Cover photograph"
                        value={draft.brand.bannerUrl}
                        onChange={(bannerUrl) => updateBrand({ bannerUrl })}
                        onBusy={uploading}
                      />
                      <label>
                        A little about your restaurant
                        <textarea
                          rows={3}
                          maxLength={500}
                          value={draft.brand.description}
                          placeholder="What makes a meal with you special?"
                          onChange={(e) =>
                            updateBrand({ description: e.target.value })
                          }
                        />
                        <span className="field-hint">
                          {draft.brand.description.length}/500 · Optional, but a
                          warm welcome helps.
                        </span>
                      </label>
                      <div className="setup-color-row">
                        <label>
                          Brand colour
                          <input
                            type="color"
                            value={draft.brand.accentColor}
                            onChange={(e) =>
                              updateBrand({ accentColor: e.target.value })
                            }
                          />
                        </label>
                        <div className="color-swatches">
                          {[
                            "#c65b36",
                            "#234b3c",
                            "#84623e",
                            "#80577b",
                            "#365f83",
                          ].map((color) => (
                            <button
                              key={color}
                              aria-label={`Use colour ${color}`}
                              className={
                                draft.brand.accentColor === color
                                  ? "selected"
                                  : ""
                              }
                              style={{ background: color }}
                              onClick={() =>
                                updateBrand({ accentColor: color })
                              }
                            >
                              {draft.brand.accentColor === color && (
                                <Check size={15} />
                              )}
                            </button>
                          ))}
                        </div>
                        <code>{draft.brand.accentColor.toUpperCase()}</code>
                      </div>
                      <div className="setup-hours">
                        <div className="setup-subheading">
                          <Clock3 size={18} />
                          <div>
                            <h3>When does your kitchen welcome orders?</h3>
                            <p>
                              You can pause orders any time from your dashboard.
                            </p>
                          </div>
                        </div>
                        <div className="form-grid">
                          <label>
                            Opens at
                            <input
                              type="time"
                              value={draft.brand.openingTime}
                              onChange={(e) =>
                                updateBrand({ openingTime: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Closes at
                            <input
                              type="time"
                              value={draft.brand.closingTime}
                              onChange={(e) =>
                                updateBrand({ closingTime: e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <p className="field-hint">
                          {draft.details.timezone} · Equal times mean open 24
                          hours. Overnight hours are supported.
                        </p>
                      </div>
                    </div>
                  </section>
                  <aside className="setup-preview-column">
                    <div className="preview-caption">
                      <Eye size={14} /> YOUR GUEST’S FIRST IMPRESSION
                    </div>
                    <MenuPreview draft={draft} />
                    <p className="preview-footnote">
                      Live preview · Only you can see this
                    </p>
                  </aside>
                </div>
              )}
              {step === 3 && (
                <div className="setup-menu-layout">
                  <section>
                    <div className="setup-menu-toolbar">
                      <span>
                        <strong>{draft.categories.length}</strong> categories{" "}
                        <i>·</i> <strong>{dishCount}</strong> dishes
                      </span>
                      <button
                        className="button secondary"
                        disabled={draft.categories.length >= 10}
                        onClick={() =>
                          change({
                            ...draft,
                            categories: [
                              ...draft.categories,
                              {
                                id: crypto.randomUUID(),
                                name: "",
                                items: [
                                  {
                                    id: crypto.randomUUID(),
                                    name: "",
                                    description: "",
                                    price: "",
                                    imageUrl: "",
                                    isVeg: true,
                                    isPopular: false,
                                  },
                                ],
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={16} /> Add category
                      </button>
                    </div>
                    {!draft.categories.length && (
                      <div className="setup-menu-empty">
                        <span>
                          <UtensilsCrossed size={32} />
                        </span>
                        <h2>Every great menu starts with one dish.</h2>
                        <p>
                          Create your first category, then add a favourite from
                          your kitchen.
                        </p>
                        <button
                          className="button primary"
                          onClick={() =>
                            change({
                              ...draft,
                              categories: [
                                {
                                  id: crypto.randomUUID(),
                                  name: "",
                                  items: [
                                    {
                                      id: crypto.randomUUID(),
                                      name: "",
                                      description: "",
                                      price: "",
                                      imageUrl: "",
                                      isVeg: true,
                                      isPopular: false,
                                    },
                                  ],
                                },
                              ],
                            })
                          }
                        >
                          <Plus size={16} /> Create your first category
                        </button>
                        <div className="category-suggestions">
                          <span>A few ideas</span>
                          {["Starters", "Main Course", "Drinks"].map((name) => (
                            <button
                              key={name}
                              onClick={() =>
                                change({
                                  ...draft,
                                  categories: [
                                    {
                                      id: crypto.randomUUID(),
                                      name,
                                      items: [
                                        {
                                          id: crypto.randomUUID(),
                                          name: "",
                                          description: "",
                                          price: "",
                                          imageUrl: "",
                                          isVeg: true,
                                          isPopular: false,
                                        },
                                      ],
                                    },
                                  ],
                                })
                              }
                            >
                              {name} <Plus size={11} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {draft.categories.map((category, categoryIndex) => (
                      <section
                        className="setup-menu-category"
                        key={category.id}
                      >
                        <div className="setup-category-heading">
                          <span className="category-index">
                            {String(categoryIndex + 1).padStart(2, "0")}
                          </span>
                          <label>
                            <span className="sr-only">
                              Category name {categoryIndex + 1}
                            </span>
                            <input
                              value={category.name}
                              placeholder="Category name, e.g. Starters"
                              maxLength={60}
                              onChange={(e) =>
                                editCategory(category.id, (c) => ({
                                  ...c,
                                  name: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <button
                            className="icon-button"
                            aria-label={`Remove category ${category.name || categoryIndex + 1}`}
                            onClick={() =>
                              change({
                                ...draft,
                                categories: draft.categories.filter(
                                  (c) => c.id !== category.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        {category.items.map((dish, index) => (
                          <div className="setup-dish-editor" key={dish.id}>
                            <div className="setup-dish-label">
                              <span>
                                DISH {String(index + 1).padStart(2, "0")}
                              </span>
                              <div>
                                <button
                                  className="icon-button"
                                  disabled={index === 0}
                                  aria-label={`Move dish ${index + 1} up in ${category.name}`}
                                  onClick={() =>
                                    editCategory(category.id, (c) => {
                                      const items = [...c.items];
                                      [items[index - 1], items[index]] = [
                                        items[index],
                                        items[index - 1],
                                      ];
                                      return { ...c, items };
                                    })
                                  }
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  className="icon-button"
                                  disabled={index === category.items.length - 1}
                                  aria-label={`Move dish ${index + 1} down in ${category.name}`}
                                  onClick={() =>
                                    editCategory(category.id, (c) => {
                                      const items = [...c.items];
                                      [items[index + 1], items[index]] = [
                                        items[index],
                                        items[index + 1],
                                      ];
                                      return { ...c, items };
                                    })
                                  }
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button
                                  className="icon-button"
                                  aria-label={`Remove dish ${index + 1} from ${category.name}`}
                                  onClick={() =>
                                    editCategory(category.id, (c) => ({
                                      ...c,
                                      items: c.items.filter(
                                        (i) => i.id !== dish.id,
                                      ),
                                    }))
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                            <div className="setup-dish-fields">
                              <label>
                                Dish name
                                <input
                                  value={dish.name}
                                  placeholder="e.g. Chicken Biryani"
                                  maxLength={100}
                                  onChange={(e) =>
                                    editCategory(category.id, (c) => ({
                                      ...c,
                                      items: c.items.map((i) =>
                                        i.id === dish.id
                                          ? { ...i, name: e.target.value }
                                          : i,
                                      ),
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                Price ({draft.details.currency})
                                <input
                                  value={dish.price}
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  maxLength={9}
                                  onChange={(e) =>
                                    editCategory(category.id, (c) => ({
                                      ...c,
                                      items: c.items.map((i) =>
                                        i.id === dish.id
                                          ? { ...i, price: e.target.value }
                                          : i,
                                      ),
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <label>
                              Description{" "}
                              <span className="optional">Optional</span>
                              <textarea
                                value={dish.description}
                                rows={2}
                                maxLength={500}
                                placeholder="Tell guests what makes this dish special."
                                onChange={(e) =>
                                  editCategory(category.id, (c) => ({
                                    ...c,
                                    items: c.items.map((i) =>
                                      i.id === dish.id
                                        ? { ...i, description: e.target.value }
                                        : i,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <div className="setup-dish-options">
                              <label className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={dish.isVeg}
                                  onChange={(e) =>
                                    editCategory(category.id, (c) => ({
                                      ...c,
                                      items: c.items.map((i) =>
                                        i.id === dish.id
                                          ? { ...i, isVeg: e.target.checked }
                                          : i,
                                      ),
                                    }))
                                  }
                                />
                                <Leaf size={14} /> Vegetarian
                              </label>
                              <label className="inline-check">
                                <input
                                  type="checkbox"
                                  checked={dish.isPopular}
                                  onChange={(e) =>
                                    editCategory(category.id, (c) => ({
                                      ...c,
                                      items: c.items.map((i) =>
                                        i.id === dish.id
                                          ? {
                                              ...i,
                                              isPopular: e.target.checked,
                                            }
                                          : i,
                                      ),
                                    }))
                                  }
                                />{" "}
                                Guest favourite
                              </label>
                            </div>
                            <SetupImage
                              restaurantId={restaurantId}
                              label={`Photo for ${dish.name || "this dish"}`}
                              value={dish.imageUrl}
                              onBusy={uploading}
                              onChange={(imageUrl) =>
                                editCategory(category.id, (c) => ({
                                  ...c,
                                  items: c.items.map((i) =>
                                    i.id === dish.id ? { ...i, imageUrl } : i,
                                  ),
                                }))
                              }
                              compact
                            />
                          </div>
                        ))}
                        <button
                          className="setup-add-dish"
                          disabled={
                            category.items.length >= 30 || dishCount >= 100
                          }
                          onClick={() => addDish(category.id)}
                        >
                          <Plus size={17} /> Add another dish
                        </button>
                      </section>
                    ))}
                  </section>
                  <aside className="setup-advice menu-advice">
                    <span className="advice-icon">
                      <UtensilsCrossed size={24} />
                    </span>
                    <h3>
                      Start small.
                      <br />
                      Make it delicious.
                    </h3>
                    <p>
                      You only need one category and one dish to launch. Add the
                      rest at your own pace.
                    </p>
                    <ul>
                      <li>
                        <Check size={14} /> Use the prices guests pay.
                      </li>
                      <li>
                        <Check size={14} /> Keep descriptions short and
                        inviting.
                      </li>
                      <li>
                        <Check size={14} /> Mark vegetarian dishes clearly.
                      </li>
                      <li>
                        <Check size={14} /> Your own photos make a difference.
                      </li>
                    </ul>
                    <button
                      className="button secondary full"
                      onClick={() => setPreview(true)}
                    >
                      <Eye size={16} /> Preview your menu
                    </button>
                    <div className="setup-private-note">
                      <Save size={16} />
                      <span>
                        Your draft saves as you go.
                        <br />
                        No dishes are public yet.
                      </span>
                    </div>
                  </aside>
                </div>
              )}
              {step === 4 && (
                <div className="setup-review-layout">
                  <section>
                    <div className="setup-panel review-restaurant">
                      <div
                        className="review-brand-mark"
                        style={{ background: draft.brand.accentColor }}
                      >
                        {draft.brand.logoUrl ? (
                          <img
                            src={draft.brand.logoUrl}
                            alt="Restaurant logo"
                          />
                        ) : (
                          <UtensilsCrossed size={25} />
                        )}
                      </div>
                      <div>
                        <span className="eyebrow">YOUR RESTAURANT</span>
                        <h2>{draft.details.name}</h2>
                        <p>{draft.details.address}</p>
                      </div>
                      <button
                        className="text-link"
                        onClick={() => void navigate(1)}
                      >
                        Edit details
                      </button>
                    </div>
                    <section className="setup-panel review-checklist">
                      <h2>Looking good. Here’s what’s ready.</h2>
                      {[
                        {
                          title: "A home for your menu",
                          detail: menuUrl,
                          step: 1,
                        },
                        {
                          title: "Your brand, your hours",
                          detail: `${draft.brand.openingTime} – ${draft.brand.closingTime} · ${draft.details.timezone}`,
                          step: 2,
                        },
                        {
                          title: "A menu worth exploring",
                          detail: `${dishCount} dishes across ${draft.categories.length} categories · ${draft.details.currency}`,
                          step: 3,
                        },
                        {
                          title: "A simple way to settle up",
                          detail:
                            "Customers order by name. Payment stays at your counter.",
                          step: 0,
                        },
                      ].map((c) => (
                        <div className="review-check-row" key={c.title}>
                          <CheckCircle2 size={21} />
                          <span>
                            <strong>{c.title}</strong>
                            <small>{c.detail}</small>
                          </span>
                          {c.step > 0 && (
                            <button
                              className="text-link"
                              onClick={() => void navigate(c.step)}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      ))}
                    </section>
                    <section className="setup-panel launch-preference">
                      <div>
                        <Clock3 size={22} />
                        <span>
                          <strong>Ready to take orders?</strong>
                          <p>
                            When enabled, orders follow your opening hours. You
                            can pause them whenever you need.
                          </p>
                        </span>
                      </div>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={draft.acceptingOrders}
                          onChange={(e) =>
                            change({
                              ...draft,
                              acceptingOrders: e.target.checked,
                            })
                          }
                        />{" "}
                        Accept orders when my kitchen is open
                      </label>
                    </section>
                    <div className="publish-note">
                      <ShieldCheck size={19} />
                      <p>
                        Publishing makes your menu public at the address above.
                        You can edit your dishes, branding, and hours after
                        launch. Your QR address stays the same.
                      </p>
                    </div>
                  </section>
                  <aside className="setup-review-preview">
                    <div className="preview-caption">
                      <Eye size={14} /> THE VIEW FROM YOUR GUEST’S PHONE
                    </div>
                    <MenuPreview draft={draft} />
                    <button
                      className="text-link"
                      onClick={() => setPreview(true)}
                    >
                      Explore full preview <ExternalLink size={14} />
                    </button>
                    <div className="review-qr-note">
                      <QrCode size={25} />
                      <span>
                        Your restaurant QR will be ready to download as soon as
                        you launch.
                      </span>
                    </div>
                  </aside>
                </div>
              )}
              <footer className="setup-step-footer">
                <button
                  className="setup-back"
                  disabled={busy || step === 1}
                  onClick={() => void navigate(step - 1)}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <span className="setup-footer-note">
                  <LockKeyhole size={13} />
                  {step === 4
                    ? "You’re in control of when you go live."
                    : "Private until you publish."}
                </span>
                <button
                  className="button primary"
                  disabled={!canAct}
                  onClick={() =>
                    step === 4 ? void launch() : void navigate(step + 1)
                  }
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={16} className="spin" />
                      {step === 4 ? "Publishing…" : "Saving…"}
                    </>
                  ) : step === 4 ? (
                    <>
                      <Rocket size={16} /> Publish restaurant
                    </>
                  ) : (
                    <>
                      Save & continue <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </footer>
            </>
          )}
        </main>
        <footer className="setup-global-footer">
          <span>© {new Date().getFullYear()} TableBabu</span>
          <span>Thoughtfully simple. Deliciously effective.</span>
        </footer>
      </div>
      {preview && (
        <Modal title="Your menu preview" onClose={() => setPreview(false)}>
          <div className="full-menu-preview">
            <MenuPreview draft={draft} full />
          </div>
          <p className="preview-footnote">
            Private preview — guests can order after you publish.
          </p>
        </Modal>
      )}
    </div>
  );
}

function SetupImage({
  restaurantId,
  label,
  value,
  onChange,
  onBusy,
  compact = false,
}: {
  restaurantId: string;
  label: string;
  value: string;
  onChange: (url: string) => void;
  onBusy: (busy: boolean) => void;
  compact?: boolean;
}) {
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  return (
    <div className={`setup-image-field ${compact ? "compact" : ""}`}>
      <div className="setup-image-title">
        <strong>{label}</strong>
        <span>Optional</span>
      </div>
      <div className="setup-image-input">
        {value ? (
          <FoodImage src={value} alt={label} />
        ) : (
          <span className="setup-image-placeholder">
            <ImagePlus size={compact ? 21 : 25} />
          </span>
        )}
        <div>
          <label className="button secondary setup-upload-button">
            <Upload size={14} />
            {uploading
              ? "Uploading…"
              : value
                ? "Replace image"
                : "Upload image"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setError("Choose an image smaller than 5 MB.");
                  return;
                }
                setError("");
                setUploading(true);
                onBusy(true);
                const form = new FormData();
                form.append("image", file);
                try {
                  const result = await api<{ url: string }>(
                    `/uploads?onboardingRestaurant=${encodeURIComponent(restaurantId)}`,
                    {
                      method: "POST",
                      body: form,
                    },
                  );
                  onChange(result.url);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setUploading(false);
                  onBusy(false);
                }
              }}
            />
          </label>
          <p>JPG, PNG or WebP · Up to 5 MB</p>
        </div>
        <div className="setup-image-actions">
          <button
            type="button"
            className="text-link"
            onClick={() => setUrlOpen(!urlOpen)}
          >
            {urlOpen ? "Hide link" : "Use a link"}
          </button>
          {value && (
            <button
              className="text-link muted"
              disabled={uploading}
              onClick={() => onChange("")}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {urlOpen && (
        <label className="setup-image-url">
          Image URL
          <input
            type="url"
            placeholder="https://…"
            value={value}
            maxLength={600}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
      <ErrorBox message={error} />
    </div>
  );
}
function MenuPreview({
  draft,
  full = false,
}: {
  draft: OnboardingDraft;
  full?: boolean;
}) {
  const items = draft.categories.flatMap((c) => c.items);
  const shown = full ? items : items.slice(0, 2);
  return (
    <div
      className={`setup-phone-preview ${full ? "full" : ""}`}
      style={{ "--preview-accent": draft.brand.accentColor } as CSSProperties}
    >
      <div className="preview-phone-top">
        <span>9:41</span>
        <span>● ● ▰</span>
      </div>
      <div className="preview-cover">
        {draft.brand.bannerUrl ? (
          <img src={draft.brand.bannerUrl} alt="Cover preview" />
        ) : (
          <div className="preview-cover-placeholder">
            <UtensilsCrossed size={38} />
            <span>GOOD FOOD. GOOD COMPANY.</span>
          </div>
        )}
      </div>
      <div className="preview-restaurant-logo">
        {draft.brand.logoUrl ? (
          <img src={draft.brand.logoUrl} alt="Logo preview" />
        ) : (
          <UtensilsCrossed size={22} />
        )}
      </div>
      <div className="preview-welcome">
        <span>WELCOME TO</span>
        <h3>{draft.details.name || "Your restaurant"}</h3>
        <p>
          {draft.brand.description ||
            "A warm welcome. A freshly made favourite. A lovely meal ahead."}
        </p>
      </div>
      <div className="preview-name-form">
        <strong>What should we call you?</strong>
        <div>Your name</div>
        <span>
          View menu <ArrowRight size={13} />
        </span>
      </div>
      {!!shown.length && (
        <div className="preview-menu-items">
          {shown.map((i) => (
            <div key={i.id}>
              <span className={`veg-symbol ${i.isVeg ? "" : "nonveg"}`}>
                <i />
              </span>
              <span>
                <strong>{i.name || "Your signature dish"}</strong>
                {full && i.description && <small>{i.description}</small>}
              </span>
              <b>{money(Number(i.price) || 0, draft.details.currency)}</b>
            </div>
          ))}
        </div>
      )}
      <div className="preview-powered">
        No signup. Pay at the counter.
        <br />
        <b>TableBabu</b>
      </div>
    </div>
  );
}
