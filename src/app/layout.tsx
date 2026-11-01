import type { Metadata } from "next";
// Per-request CSP nonces require runtime rendering, including public pages.
export const dynamic = "force-dynamic";
import "./globals.css";
import "./onboarding.css";
import "./responsive.css";
import "./platform.css";
export const metadata: Metadata = {
  title: "TableBabu — Good food. Better flow.",
  description:
    "A simpler way to order. Scan, choose your favourites, and pay at the counter.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
