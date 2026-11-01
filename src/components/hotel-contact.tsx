"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Mail,
  CheckCircle2,
  MessageSquare,
  Bell,
} from "lucide-react";
import { api, post } from "@/lib/client";
import { istDateTime } from "@/lib/time";
import type { EnquiryView } from "@/lib/enquiries";
import { Brand, ErrorBox } from "./ui";
import s from "./hotel-contact.module.css";
export function HotelContact() {
  const [requests, setRequests] = useState<EnquiryView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [notice, setNotice] = useState("");
  const key = useRef("");
  const versions = useRef<Record<string, number>>({});
  const load = useCallback(async () => {
    try {
      const data = await api<{ enquiries: EnquiryView[] }>("/public/enquiries");
      for (const item of data.enquiries) {
        if (
          versions.current[item.id] !== undefined &&
          versions.current[item.id] !== item.version
        )
          setNotice(
            item.updates[0]?.message || "Your enquiry has been updated.",
          );
        versions.current[item.id] = item.version;
      }
      setRequests(data.enquiries);
      setRefreshError("");
    } catch {
      setRefreshError(
        "Updates are temporarily unavailable. We will retry automatically.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    const refresh = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  return (
    <main className={s.page}>
      <header className={s.nav}>
        <Link href="/">
          <Brand />
        </Link>
        <Link href="/login">
          Owner sign in <ArrowUpRight size={16} />
        </Link>
      </header>
      <div className={s.layout}>
        <section className={s.intro}>
          <span className={s.tag}>LET'S TALK</span>
          <h1>Your next chapter starts with a conversation.</h1>
          <p>
            Tell us about your hotel or restaurant. We will help you bring your
            menu online and get your first QR ready.
          </p>
          <div className={s.steps}>
            <p>
              <MessageSquare size={20} /> Share a few details
            </p>
            <p>
              <CheckCircle2 size={20} /> Meet your assigned team member
            </p>
            <p>
              <ArrowUpRight size={20} /> Get ready to welcome orders
            </p>
          </div>
          <div className={s.direct}>
            <h2>Prefer to contact us directly?</h2>
            <p>Send an email to the TableBabu team.</p>
            <a href="mailto:debojyotisinha2210@gmail.com?subject=Hotel%20enquiry%20-%20TableBabu">
              <Mail size={18} /> Email us directly <ArrowUpRight size={16} />
            </a>
            <small>
              Opens your email app. Email conversations do not appear in this
              request tracker.
            </small>
          </div>
        </section>
        <section className={s.formPanel}>
          <h2>Tell us about your business</h2>
          <p>Our team will follow up using the contact details below.</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              const form = event.currentTarget;
              const fields = Object.fromEntries(new FormData(form));
              if (!key.current) key.current = crypto.randomUUID();
              setBusy(true);
              setError("");
              try {
                await post("/public/enquiries/session");
                const item = await post<EnquiryView>("/public/enquiries", {
                  ...fields,
                  contactAllowed: fields.contactAllowed === "on",
                  idempotencyKey: key.current,
                });
                setRequests((previous) => [
                  item,
                  ...previous.filter((row) => row.id !== item.id),
                ]);
                versions.current[item.id] = item.version;
                key.current = "";
                form.reset();
                setNotice(
                  "Message received. Your enquiry is now with our team. Assignment updates will appear below.",
                );
                document
                  .getElementById("enquiry-status")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className={s.fields}>
              <label>
                Your name
                <input
                  name="ownerName"
                  autoComplete="name"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
              <label>
                Hotel or restaurant name
                <input
                  name="hotelName"
                  autoComplete="organization"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <label>
                Mobile number (optional)
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="10-digit Indian mobile number"
                  maxLength={15}
                />
              </label>
            </div>
            <label>
              City
              <input
                name="city"
                autoComplete="address-level2"
                minLength={2}
                maxLength={100}
                required
              />
            </label>
            <label>
              How can we help?
              <textarea
                name="message"
                rows={4}
                minLength={10}
                maxLength={2000}
                required
                placeholder="Tell us about your menu, your business, or what you would like help with."
              />
            </label>
            <div hidden aria-hidden="true">
              <label>
                Website
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <label className={s.consent}>
              <input type="checkbox" name="contactAllowed" required />
              <span>
                I agree to be contacted about this enquiry. My details will be
                shared with the assigned TableBabu team member.{" "}
                <Link href="/legal/privacy">Privacy notice</Link>
              </span>
            </label>
            <ErrorBox message={error} />
            <button className={s.submit} disabled={busy}>
              {busy ? "Sending your message..." : "Send enquiry"}
              <ArrowUpRight size={18} />
            </button>
          </form>
        </section>
      </div>
      <section id="enquiry-status" className={s.tracker}>
        <div className={s.trackerHeading}>
          <div>
            <h2>
              <Bell size={22} /> Your enquiries
            </h2>
            <p>
              Assignment updates appear here automatically. Return in this
              browser within 30 days. Clearing cookies removes access; no email
              or SMS notifications are sent.
            </p>
          </div>
          <button className="button secondary" onClick={() => void load()}>
            Refresh updates
          </button>
        </div>
        <div role="status" aria-live="polite">
          {notice && <p className={s.notice}>{notice}</p>}
        </div>
        <ErrorBox message={refreshError} />
        {!requests.length && (
          <p>Your submitted requests and team updates will appear here.</p>
        )}
        <div className={s.requests}>
          {requests.map((item) => (
            <article key={item.id}>
              <div className={s.requestHead}>
                <h3>{item.hotelName}</h3>
                <span>
                  {item.status === "NEW"
                    ? "Received"
                    : item.status.toLowerCase()}
                </span>
              </div>
              <small>{istDateTime(item.createdAt)} IST</small>
              <p>
                {item.assignedTo
                  ? `Your team member: ${item.assignedTo.name}`
                  : "Waiting for a team member to be assigned."}
              </p>
              {item.updates.length > 0 ? (
                <ul>
                  {item.updates.map((update) => (
                    <li key={update.id}>
                      <p>{update.message}</p>
                      <small>{istDateTime(update.createdAt)} IST</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>We have received your message and will review it shortly.</p>
              )}
              <small>Reference: {item.id}</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
