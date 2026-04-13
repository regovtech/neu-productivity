import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { sql } from "@/lib/db/client";
import { OnboardingWizard } from "./OnboardingWizard";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const userId = session.user.id as string;
  const [row] = await sql<{ display_name: string | null; onboarding_completed_at: Date | null }[]>`
    SELECT display_name, onboarding_completed_at FROM users WHERE id = ${userId}
  `;

  // Already onboarded — go to dashboard
  if (row?.onboarding_completed_at) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-lg">
      <OnboardingWizard currentDisplayName={row?.display_name ?? null} />
    </div>
  );
}
