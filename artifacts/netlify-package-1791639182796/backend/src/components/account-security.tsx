"use client";
import { useState } from "react";
import { post } from "@/lib/client";
import { ErrorBox } from "./ui";

export function AccountSecurity() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="panel settings-panel" style={{ marginTop: 24 }}>
      <h2>Account security</h2>
      <p className="muted">
        Change your password and sign out every device, including this one.
      </p>
      <form
        className="settings-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setError("");
          if (data.get("newPassword") !== data.get("confirmPassword")) {
            setError("Your new passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            await post("/auth/password", {
              currentPassword: data.get("currentPassword"),
              newPassword: data.get("newPassword"),
            });
            window.location.replace("/login");
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Unable to change your password.",
            );
            setBusy(false);
          }
        }}
      >
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
          />
        </label>
        <p className="muted text-sm">
          Use a unique passphrase with at least 12 characters.
        </p>
        <ErrorBox message={error} />
        <button className="button primary" disabled={busy}>
          {busy ? "Updating password…" : "Change password & sign out"}
        </button>
      </form>
    </section>
  );
}
