import Dashboard from "@/components/dashboard";
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  return <Dashboard section={section?.[0] || "overview"} />;
}
