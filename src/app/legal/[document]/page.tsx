import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { policies, legalBusiness, POLICY_VERSION } from "@/lib/legal";
import { LegalLinks } from "@/components/legal-links";
import PrivacyRequestForm from "@/components/privacy-request-form";
import s from "./policy.module.css";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document } = await params;
  const policy = Object.hasOwn(policies, document)
    ? policies[document]
    : undefined;
  return {
    title: `${document === "contact" ? "Privacy requests & grievances" : policy?.title || "Legal information"} | TableBabu`,
    robots: { index: false, follow: true },
  };
}
export default async function PolicyPage({
  params,
}: {
  params: Promise<{ document: string }>;
}) {
  const { document } = await params;
  const policy = Object.hasOwn(policies, document)
    ? policies[document]
    : undefined;
  if (!policy && document !== "contact") notFound();
  return (
    <main className={s.page}>
      <Link className={s.brand} href="/">
        TableBabu
      </Link>
      <LegalLinks />
      <h1>{policy?.title || "Privacy requests & grievances"}</h1>
      <p className={s.date}>Version {POLICY_VERSION} · India</p>
      <aside className={s.notice}>
        These initial policies describe the application and the business details
        supplied by the operator. Legal and operational review is still required
        before a public production rollout.
      </aside>
      {policy ? (
        policy.sections.map(([title, text]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))
      ) : (
        <>
          <section>
            <h2>Contact TableBabu</h2>
            <p>
              {legalBusiness.name}
              <br />
              {legalBusiness.address}
              <br />
              <a href={`mailto:${legalBusiness.email}`}>
                {legalBusiness.email}
              </a>
            </p>
            <p>
              For a food order or payment issue, contact the restaurant
              directly. For privacy, access, correction, erasure, consent
              withdrawal, nomination or other grievances, use this form or email
              us. We aim to acknowledge requests within 48 hours and resolve
              them within 30 days. We may need proportionate verification before
              releasing or changing data.
            </p>
            <p>
              Do not include passwords, OTPs, Aadhaar, card details, UPI PINs or
              sensitive health information. A reference number confirms receipt
              only; it does not mean identity is verified or that data has been
              deleted.
            </p>
          </section>
          <PrivacyRequestForm />
        </>
      )}
      <LegalLinks />
    </main>
  );
}
