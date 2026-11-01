"use client";
import { useEffect, useRef } from "react";

import {
  QrCode,
  ArrowUpRight,
  Check,
  Bell,
  ReceiptText,
  Download,
  TrendingUp,
} from "lucide-react";
import s from "./platform-cards.module.css";

export function PlatformCards() {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!section.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-revealed", "true");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.15 },
    );
    section.current
      .querySelectorAll("article")
      .forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={section}
      id="platform"
      className={s.section}
      aria-labelledby="platform-title"
    >
      <div className={s.heading}>
        <h2 id="platform-title">
          Less chasing orders.
          <br />
          More looking after guests.
        </h2>
        <p>
          From the first scan to the final bill, TableBabu keeps your guests and
          your team on the same page.
        </p>
      </div>
      <div className={s.grid}>
        <article className={`${s.card} ${s.menu}`}>
          <div className={s.visual} aria-hidden="true">
            <div className={s.qr}>
              <QrCode size={80} strokeWidth={1.5} />
              <span>Scan to order</span>
            </div>
            <div className={s.menuPreview}>
              <span>Bengal Bistro</span>
              <strong>Hi Rahul 👋</strong>
              <div className={s.dish}>
                <img
                  src="/images/biryani.webp"
                  width="72"
                  height="72"
                  alt=""
                  loading="lazy"
                />
                <div>
                  Chicken Biryani<strong>₹290</strong>
                </div>
                <span className={s.add}>+</span>
              </div>
              <div className={s.menuFooter}>
                Your menu. Their phone.
                <ArrowUpRight size={17} />
              </div>
            </div>
          </div>
          <h3>A menu that’s always yours.</h3>
          <p>
            Guests scan one QR, enter their name and order. Update dishes,
            prices and availability whenever your kitchen needs to.
          </p>
          <a href="/signup">
            Build your digital menu <ArrowUpRight size={18} />
          </a>
        </article>
        <article className={`${s.card} ${s.orders}`}>
          <div className={s.visual} aria-hidden="true">
            <div className={s.orderPreview}>
              <div className={s.orderTop}>
                <Bell size={18} />
                <span>New order</span>
                <span>Just now</span>
              </div>
              <div className={s.guest}>
                Rahul <span>BENGAL:2026:000042</span>
              </div>
              <div className={s.orderItem}>
                1 × Chicken Biryani <strong>₹290</strong>
              </div>
              <div className={s.statuses}>
                <span>
                  <Check size={13} />
                  Received
                </span>
                <span>Preparing</span>
                <span>Completed</span>
              </div>
            </div>
          </div>
          <h3>Every order, in the right hands.</h3>
          <p>
            Orders arrive live with a guest name and order number. Your team
            updates the status, and guests follow along on their phones.
          </p>
          <a href="#product">
            Explore live orders <ArrowUpRight size={18} />
          </a>
        </article>
        <article className={`${s.card} ${s.billing}`}>
          <div className={s.visual} aria-hidden="true">
            <div className={s.billPreview}>
              <ReceiptText size={23} />
              <div>One visit. One bill.</div>
              <strong>₹760</strong>
              <div className={s.paymentChoices}>
                <span>Cash</span>
                <span>
                  UPI <Check size={13} />
                </span>
              </div>
              <div className={s.receipt}>
                <Check size={15} />
                Staff confirms payment
                <Download size={15} />
              </div>
            </div>
          </div>
          <h3>A simpler finish to every visit.</h3>
          <p>
            Keep additional orders on one bill. Guests choose Cash or UPI, pay
            at the counter and download their receipt after your team confirms
            payment.
          </p>
          <a href="#billing">
            See how billing works <ArrowUpRight size={18} />
          </a>
        </article>
        <article className={`${s.card} ${s.insights}`}>
          <div className={s.visual} aria-hidden="true">
            <div className={s.insightPreview}>
              <div className={s.insightTop}>
                <TrendingUp size={22} />A clearer picture of your day
              </div>
              <div className={s.chart}>
                {[36, 58, 45, 83, 65, 100, 78].map((height, i) => (
                  <span key={i} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className={s.insightFooter}>
                <span>Sales & popular dishes</span>
                <span>
                  PDF <Download size={14} />
                </span>
              </div>
            </div>
          </div>
          <h3>Know what keeps them coming back.</h3>
          <p>
            See sales, popular dishes and Cash versus UPI activity. Download
            transaction reports for a closer look at your business.
          </p>
          <a href="/signup">
            Make it your workspace <ArrowUpRight size={18} />
          </a>
        </article>
      </div>
    </section>
  );
}
