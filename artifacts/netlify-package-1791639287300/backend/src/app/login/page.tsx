"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, UtensilsCrossed } from "lucide-react";
import { Brand, ErrorBox } from "@/components/ui";
import { post } from "@/lib/client";
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">LESS WAITING. MORE ENJOYING.</span>
          <h1>
            Good food.
            <br />
            Better flow.
          </h1>
          <p>
            A warm welcome, a full kitchen, and one less thing to worry about.
          </p>
          <div className="story-pill">
            <UtensilsCrossed size={18} /> Made for the way restaurants work
          </div>
        </div>
        <span className="login-foot">
          A little technology. A lot more hospitality.
        </span>
      </section>
      <section className="login-form">
        <div className="login-box">
          <div className="eyebrow">YOUR RESTAURANT, CONNECTED</div>
          <h2>Welcome back.</h2>
          <p>Sign in to keep the good food flowing.</p>
          <ErrorBox message={error} />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const result = await post<{ redirectTo: string }>(
                  "/auth/login",
                  Object.fromEntries(f),
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
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@restaurant.com"
                required
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to your restaurant"}
              <ArrowRight size={18} />
            </button>
          </form>
          <div className="signup-invitation">
            <span>New to TableBabu?</span>
            <Link href="/signup">
              Set up your restaurant <ArrowRight size={15} />
            </Link>
          </div>
          <p className="login-help">
            Your customers don’t need an account.
            <br />
            Just a name, an appetite, and your QR.
          </p>
        </div>
        <span className="muted text-sm">Powered by TableBabu</span>
      </section>
    </main>
  );
}
