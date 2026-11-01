"use client";
import { useState } from "react";
import { api } from "@/lib/client";
import { ErrorBox } from "./ui";

export function SubscriptionQrEditor({
  hotel: r,
  isAdmin,
  busy,
  save,
  onChanged,
}: {
  hotel: {
    restaurantId: string;
    version: number;
    hasQr: boolean;
    qrLocked: boolean;
    qrUploaded: boolean;
    upiId: string;
    payee: string;
    amount: string;
  };
  isAdmin: boolean;
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const disabled = busy || uploading || !isAdmin || r.qrLocked;
  return (
    <section
      className="platform-editor subscription-qr-editor"
      aria-label="Subscription payment QR"
    >
      <h3>Subscription payment QR</h3>
      <p>
        Only this restaurant's owner receives this payment QR. Only a platform
        admin can change it.
      </p>
      {r.hasQr && (
        <img
          className="subscription-qr"
          src={`/api/platform/restaurants/${r.restaurantId}/qr?v=${r.version}`}
          alt="Assigned subscription UPI payment QR"
        />
      )}
      <section aria-label="Lock QR">
        <h3>Lock QR</h3>
        <p role="status">
          {r.qrLocked
            ? "Locked — protected from changes."
            : "Unlocked — only an admin can make changes."}
        </p>
        {isAdmin && r.hasQr && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || uploading}
            onClick={() =>
              void save({ action: "qr-lock", locked: !r.qrLocked })
            }
          >
            {r.qrLocked ? "Unlock QR" : "Lock QR"}
          </button>
        )}
      </section>
      {isAdmin && (
        <>
          <ErrorBox message={error} />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (disabled) return;
              const body = new FormData(e.currentTarget);
              body.set("version", String(r.version));
              setUploading(true);
              setError("");
              try {
                await api(`/platform/restaurants/${r.restaurantId}/qr/upload`, {
                  method: "POST",
                  body,
                });
                await onChanged();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setUploading(false);
              }
            }}
          >
            <h3>Upload QR</h3>
            <p>
              Upload your UPI payment QR as PNG, JPEG, or WebP (up to 5 MB / 4
              megapixels). Check the recipient in your UPI app before sharing.
            </p>
            <label>
              QR image
              <input
                name="image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
                disabled={disabled}
              />
            </label>
            <button className="button primary" disabled={disabled}>
              {uploading ? "Uploading…" : "Upload & lock QR"}
            </button>
          </form>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (disabled) return;
              const f = new FormData(e.currentTarget);
              void save({
                action: "qr",
                upiId: String(f.get("upiId")),
                payee: String(f.get("payee")),
                amount: f.get("amount") ? Number(f.get("amount")) : null,
              });
            }}
          >
            <h3>Or generate from UPI details</h3>
            <label>
              Your UPI ID
              <input
                name="upiId"
                defaultValue={r.upiId}
                maxLength={100}
                placeholder="business@bank"
                disabled={disabled}
              />
            </label>
            <label>
              Payment recipient name
              <input
                name="payee"
                defaultValue={r.payee}
                maxLength={80}
                disabled={disabled}
              />
            </label>
            <label>
              Requested amount (INR, optional)
              <input
                name="amount"
                type="number"
                min="0.01"
                max="999999"
                step="0.01"
                defaultValue={r.amount}
                disabled={disabled}
              />
            </label>
            <p>
              Saving replaces the assigned QR and locks it. Clear the UPI ID and
              save to remove it after unlocking.
            </p>
            <button className="button primary" disabled={disabled}>
              Save &amp; send QR
            </button>
          </form>
        </>
      )}
    </section>
  );
}
