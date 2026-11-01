"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { post } from "@/lib/client";
import { ErrorBox } from "./ui";
export function CreateRestaurant() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef("");
  return (
    <main className="platform-page">
      <Link href="/control-room">Back to restaurants</Link>
      <section
        className="panel"
        style={{ maxWidth: 640, margin: "32px auto", padding: 28 }}
      >
        <h1>Add a restaurant</h1>
        <p>
          Create the owner's login, then configure their restaurant, branding
          and menu. The restaurant stays private until you launch it.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const fields = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            if (!key.current) key.current = crypto.randomUUID();
            setBusy(true);
            setError("");
            try {
              const result = await post<{ redirectTo: string }>(
                "/platform/onboarding",
                { ...fields, idempotencyKey: key.current },
              );
              window.location.assign(result.redirectTo);
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          <label>
            Owner name
            <input
              name="name"
              required
              minLength={2}
              maxLength={40}
              autoComplete="off"
            />
          </label>
          <label>
            Owner email
            <input
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </label>
          <label>
            Initial password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>
          <p>
            Share credentials securely with the owner. They can change their
            password in Settings. Obtain the restaurant agreement separately;
            creating an account does not record the owner's acceptance of terms.
          </p>
          <ErrorBox message={error} />
          <button className="button primary" disabled={busy}>
            {busy ? "Creating..." : "Create and configure restaurant"}
          </button>
        </form>
      </section>
    </main>
  );
}
