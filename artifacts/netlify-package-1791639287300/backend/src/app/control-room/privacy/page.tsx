import PrivacyInbox from "@/components/privacy-inbox";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
export default async function PrivacyInboxPage() {
  const { authenticate } = await import("@/server/security");
  const auth = await authenticate((await headers()).get("cookie") || undefined);
  if (!auth) redirect("/login");
  if (auth.user.role !== "ADMIN") notFound();
  return <PrivacyInbox />;
}
