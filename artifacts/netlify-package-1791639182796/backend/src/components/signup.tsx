"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  LockKeyhole,
  QrCode,
  ReceiptText,
  UtensilsCrossed,
} from "lucide-react";
import { Brand, ErrorBox } from "./ui";
import { api, ApiError, post } from "@/lib/client";
import { registerSchema } from "@/lib/onboarding";
import { POLICY_VERSION } from "@/lib/legal";
import { LegalLinks } from "./legal-links";
import type { Restaurant } from "@/lib/types";

export default function Signup() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const key = useRef("");
  useEffect(() => {
    void api<{ restaurant: Restaurant }>("/auth/me")
      .then((me) =>
        router.replace(
          me.restaurant.onboardingStatus === "DRAFT"
            ? "/onboarding"
            : "/dashboard",
        ),
      )
      .catch(() => {});
  }, [router]);
  return (
    <main className="signup-page">
      <section className="signup-story">
        <Link href="/login">
          <Brand />
        </Link>
        <div className="signup-story-content">
          <span className="eyebrow">A BETTER SERVICE STARTS HERE</span>
          <h1>
            Your restaurant.
            <br />A whole new flow.
          </h1>
          <p>
            Give every guest a warm welcome and a faster way to order. We’ll
            help you get everything ready.
          </p>
          <div className="signup-journey">
            <div>
              <span>
                <QrCode size={21} />
              </span>
              <div>
                <strong>One QR. Your entire menu.</strong>
                <p>Your own name, colours, and dishes.</p>
              </div>
            </div>
            <div>
              <span>
                <UtensilsCrossed size={21} />
              </span>
              <div>
                <strong>From craving to kitchen.</strong>
                <p>Orders arrive with a name and a number.</p>
              </div>
            </div>
            <div>
              <span>
                <ReceiptText size={21} />
              </span>
              <div>
                <strong>Keep the counter connection.</strong>
                <p>Guests enjoy their meal. You settle the bill.</p>
              </div>
            </div>
          </div>
        </div>
        <div className="signup-story-footer">
          <span className="signup-dot" /> Built for independent restaurants.
          Ready for your everyday.
        </div>
      </section>
      <section className="signup-main">
        <div className="signup-topline">
          Already have an account?{" "}
          <Link href="/login">
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
        <div className="signup-form-wrap">
          <div className="setup-kicker">
            <span>01</span> YOUR OWNER ACCOUNT
          </div>
          <h2>Let’s set your table.</h2>
          <p className="signup-subtitle">
            Create your account, then make TableBabu yours.
          </p>
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError("");
              setFields({});
              if (!key.current) key.current = crypto.randomUUID();
              const data = {
                ...Object.fromEntries(new FormData(e.currentTarget)),
                idempotencyKey: key.current,
                termsAccepted:
                  new FormData(e.currentTarget).get("termsAccepted") === "on",
                adultConfirmed:
                  new FormData(e.currentTarget).get("adultConfirmed") === "on",
                policyVersion: POLICY_VERSION,
              };
              const parsed = registerSchema.safeParse(data);
              if (!parsed.success) {
                setFields(
                  Object.fromEntries(
                    parsed.error.issues.map((i) => [
                      String(i.path[0]),
                      i.message,
                    ]),
                  ),
                );
                return;
              }
              setBusy(true);
              try {
                const result = await post<{ redirectTo: string }>(
                  "/auth/register",
                  parsed.data,
                );
                router.replace(result.redirectTo);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Your name
              <input
                name="name"
                autoComplete="name"
                placeholder="e.g. Arjun Sen"
                maxLength={40}
                aria-invalid={!!fields.name}
                aria-describedby={fields.name ? "signup-name-error" : undefined}
              />
              {fields.name && (
                <span className="field-error" id="signup-name-error">
                  {fields.name}
                </span>
              )}
            </label>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@yourrestaurant.com"
                maxLength={254}
                aria-invalid={!!fields.email}
                aria-describedby={
                  fields.email ? "signup-email-error" : undefined
                }
              />
              {fields.email && (
                <span className="field-error" id="signup-email-error">
                  {fields.email}
                </span>
              )}
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  aria-label="Password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={72}
                  aria-invalid={!!fields.password}
                  aria-describedby="signup-password-hint"
                />
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <span
                id="signup-password-hint"
                className={`password-hint ${password.length >= 12 ? "met" : ""}`}
              >
                <Check size={12} /> At least 12 characters. A memorable
                passphrase works well.
              </span>
              {fields.password && (
                <span className="field-error">{fields.password}</span>
              )}
            </label>
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Enter your password again"
                maxLength={72}
                aria-invalid={!!fields.confirmPassword}
              />
              {fields.confirmPassword && (
                <span className="field-error">{fields.confirmPassword}</span>
              )}
            </label>
            <p style={{ fontSize: 14 }}>
              We use your name, email and restaurant details to operate your
              workspace and provide support. Read our{" "}
              <Link href="/legal/privacy" target="_blank">
                Privacy notice
              </Link>
              .
            </p>
            <label
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <input
                style={{ width: 18, height: 18, flexShrink: 0 }}
                type="checkbox"
                name="adultConfirmed"
              />
              I am at least 18 and authorised to represent this restaurant.
            </label>
            {fields.adultConfirmed && (
              <p role="alert">Confirm that you are an authorised adult.</p>
            )}
            <label
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
              }}
            >
              <input
                style={{ width: 18, height: 18, flexShrink: 0 }}
                type="checkbox"
                name="termsAccepted"
              />{" "}
              <span>
                I agree to the{" "}
                <Link href="/legal/terms" target="_blank">
                  Terms of service
                </Link>{" "}
                and have read the{" "}
                <Link href="/legal/refunds" target="_blank">
                  cancellation and refund policy
                </Link>
                .
              </span>
            </label>
            {fields.termsAccepted && (
              <p role="alert">
                Read and accept the terms to create an account.
              </p>
            )}
            <ErrorBox message={error} />
            <button className="button primary full" disabled={busy}>
              {busy ? "Creating your workspace…" : "Create account & continue"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="signup-security">
            <LockKeyhole size={15} />
            <span>
              Your setup stays private until you choose to launch.
              <br />
              You can save your progress and finish later.
            </span>
          </div>
          <div className="signup-next">
            <strong>UP NEXT</strong>
            <span>
              Restaurant details <i>→</i> Your brand <i>→</i> Menu <i>→</i>{" "}
              Launch
            </span>
          </div>
        </div>
        <footer className="signup-footer">
          <LegalLinks />A little technology. A lot of hospitality.
        </footer>
      </section>
    </main>
  );
}
