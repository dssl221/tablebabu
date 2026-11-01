import Link from "next/link";
import { legalLinks } from "@/lib/legal";
export function LegalLinks() {
  return (
    <nav
      aria-label="Legal information"
      style={{
        display: "flex",
        gap: "12px 20px",
        flexWrap: "wrap",
        fontSize: 13,
        margin: "16px 0",
      }}
    >
      {legalLinks.map(([label, href]) => (
        <Link key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
