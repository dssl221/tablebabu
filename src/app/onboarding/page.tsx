import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
export default async function OnboardingPage() {
  const { authenticate } = await import("@/server/security");
  const auth = await authenticate((await headers()).get("cookie") || undefined);
  if (!auth) redirect("/get-started");
  if (["ADMIN", "STAFF"].includes(auth.user.role)) redirect("/control-room");
  return (
    <main className="platform-page">
      <section className="panel">
        <h1>Your restaurant is being set up</h1>
        <p>
          The TableBabu team manages onboarding. Contact us for a setup update.
        </p>
        <p>
          <a href="mailto:debojyotisinha2210@gmail.com">Contact TableBabu</a>
        </p>
        <Link className="button secondary" href="/login">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
