import type { CSSProperties } from "react";
import { festivalTheme } from "@/lib/festival-themes";
import { FestivalBanner } from "@/components/festival-banner";
import { readHomepage } from "@/server/site-content";
import type { Metadata } from "next";
import { publicOrigin } from "@/lib/public-origin";
import { LegalLinks } from "@/components/legal-links";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  QrCode,
  ChevronDown,
  Smartphone,
  UtensilsCrossed,
  ReceiptText,
  Check,
  Coffee,
  Hotel,
} from "lucide-react";
import {
  ProductTour,
  MobileNavigation,
  ProductNavigation,
} from "@/components/home-interactions";
import s from "./home.module.css";
import { PlatformCards } from "@/components/platform-cards";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  const preview = (await searchParams).preview === "1";
  const content = await readHomepage(preview);
  return {
    title: content.title,
    description: content.description,
    robots: { index: !preview, follow: !preview },
    alternates: { canonical: `${publicOrigin()}/` },
  };
}

function Logo() {
  return (
    <Link className={s.logo} href="/" aria-label="TableBabu home">
      <QrCode size={27} />
      TableBabu
    </Link>
  );
}
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const content = await readHomepage((await searchParams).preview === "1");
  const faqs = content.faqs;
  return (
    <div
      className={s.site}
      style={
        content.festivalTheme !== "none"
          ? ({
              "--lime": festivalTheme(content.festivalTheme).highlight,
              "--ink": festivalTheme(content.festivalTheme).accent,
              background: festivalTheme(content.festivalTheme).background,
            } as CSSProperties)
          : undefined
      }
    >
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Logo />
          <nav className={s.desktopNav} aria-label="Main navigation">
            <ProductNavigation>
              <summary>
                Product <ChevronDown size={14} />
              </summary>
              <div>
                <a href="#product">
                  <Smartphone size={21} />
                  <span>
                    <strong>Explore TableBabu</strong>Menus, orders and your
                    workspace
                  </span>
                </a>
                <a href="#billing">
                  <ReceiptText size={21} />
                  <span>
                    <strong>Billing & insights</strong>Bring every visit
                    together
                  </span>
                </a>
                <a href="#how-it-works">
                  <QrCode size={21} />
                  <span>
                    <strong>Getting started</strong>From your menu to your first
                    scan
                  </span>
                </a>
              </div>
            </ProductNavigation>
            <a href="#solutions">Who it’s for</a>
            <a href="#how-it-works">How it works</a>
            <a href="#questions">FAQs</a>
          </nav>
          <div className={s.navActions}>
            <Link href="/login">Log in</Link>
            <Link className={s.darkButton} href="/get-started">
              Get started <ArrowUpRight size={16} />
            </Link>
          </div>
          <MobileNavigation />
        </div>
      </header>
      <main id="main">
        <FestivalBanner theme={content.festivalTheme} />
        <section className={`${s.container} ${s.hero}`}>
          <div className={s.heroCopy}>
            <h1>
              {content.headline}
              <br />
              <span>{content.highlight}</span>
            </h1>
            <p>{content.introduction}</p>
            <div className={s.heroActions}>
              <Link href="/get-started" className={s.darkButton}>
                {content.button} <ArrowRight size={18} />
              </Link>
              <a href="#platform" className={s.secondaryButton}>
                See how it works <ArrowUpRight size={18} />
              </a>
            </div>
            <ul className={s.heroChecks}>
              <li>
                <Check size={16} />
                No guest app
              </li>
              <li>
                <Check size={16} />
                No guest login
              </li>
              <li>
                <Check size={16} />
                Pay at the counter
              </li>
            </ul>
          </div>
          <div className={s.heroArt}>
            <img
              className={s.restaurantPhoto}
              src={content.heroImage}
              width="900"
              height="600"
              fetchPriority="high"
              alt={
                content.heroImage === "/images/restaurant.webp"
                  ? "A warmly lit restaurant dining room"
                  : content.heroImage === "/images/biryani.webp"
                    ? "A freshly prepared biryani"
                    : "A refreshing glass of lassi"
              }
            />
            <div className={s.phone}>
              <img
                src="/images/product/customer-menu.webp"
                width="390"
                height="1100"
                fetchPriority="high"
                alt="TableBabu's guest menu with food photos and ordering controls, shown with sample dishes"
              />
            </div>
            <div className={s.qrTile} aria-hidden="true">
              <QrCode size={58} strokeWidth={1.4} />
              <ArrowUpRight size={26} />
            </div>
          </div>
        </section>
        <PlatformCards />
        <div className={`${s.container} ${s.introLine}`}>
          <p>
            For the places people
            <br />
            <strong>come back to.</strong>
          </p>
          <span>
            <UtensilsCrossed />
            Restaurants
          </span>
          <span>
            <Coffee />
            Cafés
          </span>
          <span>
            <Hotel />
            Hotels
          </span>
        </div>
        <section id="product" className={`${s.container} ${s.product}`}>
          <div className={s.sectionHead}>
            <h2>
              Every order.
              <br />A little more organised.
            </h2>
            <p>
              Give guests an easy way to choose, and your team a clear view of
              what needs to happen next.
            </p>
          </div>
          <ProductTour />
        </section>
        <section id="solutions" className={s.solutions}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2>
                Your kind of place.
                <br />
                Your way of serving.
              </h2>
              <Link href="/get-started" className={s.textLink}>
                Find your flow with TableBabu <ArrowRight size={19} />
              </Link>
            </div>
            <div className={s.solutionGrid}>
              <article className={s.restaurantCard}>
                <img
                  src="/images/restaurant.webp"
                  width="900"
                  height="600"
                  loading="lazy"
                  alt="Restaurant tables ready for dinner"
                />
                <div>
                  <h3>For a full dining room.</h3>
                  <p>
                    Let guests order without waiting to catch someone’s
                    attention. Keep names and order numbers clear for your team.
                  </p>
                  <Link href="/get-started">
                    Contact us for setup <ArrowUpRight size={20} />
                  </Link>
                </div>
              </article>
              <article className={s.cafeCard}>
                <Coffee size={35} strokeWidth={1.5} />
                <h3>
                  Another drink?
                  <br />
                  Already ordered.
                </h3>
                <p>
                  Make second rounds and something sweet easy. Additional orders
                  stay with the same visit.
                </p>
                <img
                  src="/images/lassi.webp"
                  width="400"
                  height="400"
                  loading="lazy"
                  alt="A refreshing mango drink"
                />
                <Link href="/get-started">
                  Set up your café <ArrowUpRight size={20} />
                </Link>
              </article>
              <article className={s.hotelCard}>
                <Hotel size={35} strokeWidth={1.5} />
                <h3>
                  A menu that feels
                  <br />
                  like your hotel.
                </h3>
                <p>
                  Your branding, your dishes and one QR for your dining space. A
                  familiar experience on every guest’s phone.
                </p>
                <div className={s.hotelGraphic} aria-hidden="true">
                  <UtensilsCrossed size={64} strokeWidth={1} />
                  <span>
                    Make yourself
                    <br />
                    at home.
                  </span>
                </div>
                <Link href="/get-started">
                  Set up your hotel restaurant <ArrowUpRight size={20} />
                </Link>
              </article>
            </div>
          </div>
        </section>
        <section id="billing" className={`${s.container} ${s.billing}`}>
          <div className={s.billingCopy}>
            <h2>
              Good service doesn’t
              <br />
              end at the last bite.
            </h2>
            <p>
              Bring the whole visit together, from the first order to the final
              bill.
            </p>
            <ul>
              <li>
                <ReceiptText size={23} />
                <div>
                  <h3>One visit. One session total.</h3>
                  <p>
                    Keep first orders, extra drinks and dessert together for a
                    clear bill.
                  </p>
                </div>
              </li>
              <li>
                <Check size={23} />
                <div>
                  <h3>Cash or UPI, clearly recorded.</h3>
                  <p>
                    Confirm payment at the counter. Your guest can then download
                    their receipt.
                  </p>
                </div>
              </li>
              <li>
                <ArrowUpRight size={23} />
                <div>
                  <h3>Know how your day went.</h3>
                  <p>
                    Review sales, popular dishes and payment methods. Download
                    transaction reports as PDFs.
                  </p>
                </div>
              </li>
            </ul>
            <Link href="/get-started" className={s.darkButton}>
              Bring your service together <ArrowRight size={18} />
            </Link>
          </div>
          <div className={s.billingVisual}>
            <div className={s.bill}>
              <QrCode size={33} />
              <h3>Every visit adds up.</h3>
              <p>First order</p>
              <div>
                <span>Chicken Biryani × 2</span>
                <strong>₹580</strong>
              </div>
              <p>A little later</p>
              <div>
                <span>Mango Lassi × 2</span>
                <strong>₹180</strong>
              </div>
              <div className={s.billTotal}>
                <span>Session total</span>
                <strong>₹760</strong>
              </div>
              <span className={s.billPayment}>
                Cash or UPI · Confirmed by your team
              </span>
            </div>
            <div className={s.billBottom}>
              <ReceiptText size={22} />
              <span>From “one more thing” to one clear bill.</span>
            </div>
          </div>
        </section>
        <section id="how-it-works" className={s.setup}>
          <div className={s.container}>
            <div className={s.sectionHead}>
              <h2>
                Make it yours.
                <br />
                Then let guests take it from there.
              </h2>
              <Link href="/get-started" className={s.limeButton}>
                Arrange your setup <ArrowRight size={18} />
              </Link>
            </div>
            <div className={s.steps}>
              {[
                [
                  "1",
                  "Meet our setup team",
                  "Share your restaurant details, branding and opening hours.",
                ],
                [
                  "2",
                  "Review your menu",
                  "We configure your dishes and prices with you before launch.",
                ],
                [
                  "3",
                  "Put your QR out",
                  "Print your restaurant QR. Guests can scan and order.",
                ],
              ].map(([n, t, p]) => (
                <article key={n}>
                  <span>{n}</span>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section id="questions" className={`${s.container} ${s.faq}`}>
          <h2>
            A few things
            <br />
            you might be wondering.
          </h2>
          <div>
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={`${s.container} ${s.finalCta}`}>
          <QrCode size={52} strokeWidth={1.5} />
          <h2>
            Your next order starts
            <br />
            with your menu.
          </h2>
          <p>Give your guests a simpler way to order.</p>
          <Link href="/get-started" className={s.darkButton}>
            Talk to our team <ArrowRight size={19} />
          </Link>
        </section>
      </main>
      <footer className={`${s.container} ${s.footer}`}>
        <div>
          <Logo />
          <p>Good food deserves good service.</p>
        </div>
        <nav aria-label="Footer navigation">
          <div>
            <strong>Explore</strong>
            <a href="#product">Product</a>
            <a href="#solutions">Who it’s for</a>
            <a href="#billing">Billing & insights</a>
          </div>
          <div>
            <strong>Get started</strong>
            <a href="#how-it-works">How it works</a>
            <Link href="/get-started">Contact our team</Link>
            <Link href="/login">Restaurant login</Link>
          </div>
        </nav>
        <LegalLinks />
        <div className={s.footerBottom}>
          <span>
            ©{" "}
            {new Intl.DateTimeFormat("en", {
              year: "numeric",
              timeZone: "Asia/Kolkata",
            }).format(new Date())}{" "}
            TableBabu
          </span>
          <a href="#questions">Frequently asked questions</a>
        </div>
      </footer>
    </div>
  );
}
