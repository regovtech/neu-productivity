import { auth } from "@/lib/auth/config";
import { Dashboard } from "./Dashboard";

export default async function DashboardPage() {
  const session = await auth();
  const displayName = (session?.user as { name?: string | null })?.name ?? null;

  return <Dashboard displayName={displayName} />;
}
