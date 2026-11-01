"use client";
import { useEffect, useState } from "react";
import { api, money } from "@/lib/client";
import { Modal } from "./ui";
type Subscription = {
  status: string;
  reason: string;
  daysRemaining: number | null;
  upiId: string;
  hasQr: boolean;
  payee: string;
  amount: string;
  version: number;
};
export function SubscriptionNotice({ refreshKey }: { refreshKey?: unknown }) {
  const [data, setData] = useState<Subscription>(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Subscription>("/subscription")
        .then((result) => {
          if (active) setData(result);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshKey]);
  if (!data || (data.status === "Not configured" && !data.hasQr)) return null;
  return (
    <section
      className="subscription-notice"
      aria-label="Restaurant subscription"
    >
      <div>
        <strong>Subscription: {data.status}</strong>
        {data.daysRemaining !== null && (
          <span> · {data.daysRemaining} days remaining</span>
        )}
        {["Frozen", "Expired", "Scheduled"].includes(data.status) && (
          <p>
            New online orders are unavailable. Existing orders and bills remain
            accessible. {data.reason}
          </p>
        )}
      </div>
      {data.hasQr && (
        <button className="button secondary" onClick={() => setOpen(true)}>
          View subscription payment QR
        </button>
      )}
      {open && (
        <Modal title="Subscription payment" onClose={() => setOpen(false)}>
          <p>Pay the platform's subscription fee using this UPI QR.</p>
          <img
            className="subscription-qr"
            src={`/api/subscription/qr?v=${data.version}`}
            alt="Your restaurant's subscription payment QR"
          />
          <p>
            <strong>{data.payee}</strong>
            <br />
            {data.upiId}
          </p>
          {data.amount && <h3>{money(data.amount)}</h3>}
          <a
            className="button secondary"
            href="/api/subscription/qr"
            download="subscription-payment-qr.png"
          >
            Download payment QR
          </a>
          <p className="muted">
            After paying, share your payment reference with the platform
            administrator. Your subscription is updated after they verify
            receipt.
          </p>
        </Modal>
      )}
    </section>
  );
}
