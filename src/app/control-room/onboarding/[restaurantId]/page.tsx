import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import Onboarding from "@/components/onboarding";
import { CreateRestaurant } from "@/components/create-restaurant";
export default async function AdminOnboarding({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { authenticate } = await import("@/server/security");
  const auth = await authenticate((await headers()).get("cookie") || undefined);
  if (!auth) redirect("/login");
  if (auth.user.role !== "ADMIN") notFound();
  const { restaurantId } = await params;
  if (restaurantId === "new") return <CreateRestaurant />;
  if (
    !(await db.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    }))
  )
    notFound();
  return <Onboarding restaurantId={restaurantId} />;
}
