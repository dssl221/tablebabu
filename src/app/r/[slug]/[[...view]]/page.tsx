import Customer from "@/components/customer";
export default async function RestaurantPage({
  params,
}: {
  params: Promise<{ slug: string; view?: string[] }>;
}) {
  const { slug, view } = await params;
  return <Customer slug={slug} view={view?.[0] || "welcome"} />;
}
