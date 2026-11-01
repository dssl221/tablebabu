"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Smartphone,
  ClipboardList,
  UtensilsCrossed,
  Menu,
  X,
} from "lucide-react";
import s from "@/app/home.module.css";
export function ProductNavigation({ children }: { children: ReactNode }) {
  const element = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (element.current && !element.current.contains(event.target as Node))
        element.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <details
      ref={element}
      className={s.dropdown}
      onClick={(event) => {
        if ((event.target as Element).closest("a") && element.current)
          element.current.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && element.current) {
          element.current.open = false;
          element.current.querySelector("summary")?.focus();
        }
      }}
    >
      {children}
    </details>
  );
}
const views = [
  {
    title: "Live orders",
    heading: "Know what's next, without asking around.",
    description:
      "See guest names, dishes and order numbers as orders arrive. Move each one from Received to Preparing to Completed.",
    image: "dashboard",
    width: 1440,
    height: 1000,
    Icon: ClipboardList,
  },
  {
    title: "Menu management",
    heading: "A menu that keeps up with your kitchen.",
    description:
      "Add a special, update a price or switch a dish to sold out. Your printed QR stays the same.",
    image: "menu-management",
    width: 1440,
    height: 1000,
    Icon: UtensilsCrossed,
  },
  {
    title: "Guest experience",
    heading: "Their favourites, just a few taps away.",
    description:
      "Guests browse your branded menu, choose their food and follow their order, all in their phone's browser.",
    image: "customer-menu",
    width: 390,
    height: 1100,
    Icon: Smartphone,
  },
];
export function ProductTour() {
  const [active, setActive] = useState(0);
  const view = views[active];
  return (
    <div className={s.tour}>
      <div className={s.tourCopy}>
        <div
          className={s.tourTabs}
          role="tablist"
          aria-label="Explore the product"
        >
          {views.map(({ title, Icon }, i) => (
            <button
              key={title}
              type="button"
              role="tab"
              id={`tour-tab-${i}`}
              aria-selected={active === i}
              aria-controls="tour-panel"
              tabIndex={active === i ? 0 : -1}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                let next = i;
                if (e.key === "ArrowRight" || e.key === "ArrowDown")
                  next = (i + 1) % views.length;
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                  next = (i + views.length - 1) % views.length;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = views.length - 1;
                else return;
                e.preventDefault();
                setActive(next);
                document.getElementById(`tour-tab-${next}`)?.focus();
              }}
            >
              <Icon size={19} />
              {title}
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
        <h3>{view.heading}</h3>
        <p>{view.description}</p>
        <Link href="/signup" className={s.textLink}>
          Make it your workspace <ArrowRight size={18} />
        </Link>
      </div>
      <div
        id="tour-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`tour-tab-${active}`}
        className={`${s.tourVisual} ${active === 2 ? s.tourPhone : ""}`}
      >
        <img
          key={view.image}
          src={`/images/product/${view.image}.webp`}
          width={view.width}
          height={view.height}
          loading="lazy"
          alt={`Actual TableBabu ${view.title.toLowerCase()} screen using sample restaurant data`}
        />
      </div>
    </div>
  );
}
export function MobileNavigation() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <div className={s.mobileNav}>
      <button
        ref={toggle}
        type="button"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? <X size={23} /> : <Menu size={23} />}
      </button>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              toggle.current?.focus();
            }
          }}
        >
          {[
            ["Product", "#product"],
            ["Who it’s for", "#solutions"],
            ["How it works", "#how-it-works"],
            ["Billing & insights", "#billing"],
            ["FAQs", "#questions"],
          ].map(([label, href]) => (
            <a key={href} href={href} onClick={() => setOpen(false)}>
              {label}
              <ArrowRight size={17} />
            </a>
          ))}
          <Link href="/signup" className={s.darkButton}>
            Create your restaurant
          </Link>
        </nav>
      )}
    </div>
  );
}
