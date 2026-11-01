import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EnquiryInbox } from "@/components/enquiry-inbox";
export default async function EnquiriesPage() {
  const { authenticate } = await import("@/server/security");
  const auth = await authenticate((await headers()).get("cookie") || undefined);
  if (!auth) redirect("/login");
  if (!["ADMIN", "STAFF"].includes(auth.user.role)) notFound();
  return <EnquiryInbox />;
}
