import { auth } from "@/lib/auth/config";
import { sql } from "@/lib/db/client";
import { NewGoalWizard } from "./NewGoalWizard";

const FREEMIUM_LIMIT = 3;

export default async function NewGoalPage() {
  const session = await auth();
  const userId = session?.user?.id!;

  // Check freemium gate server-side so locked users see it immediately
  const [{ count }] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM goals g
    JOIN workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = ${userId}
    JOIN workspaces w ON w.id = g.workspace_id
    WHERE g.owner_user_id = ${userId}
      AND g.status IN ('active', 'paused')
      AND w.plan = 'free'
  `;
  const isLocked = parseInt(count, 10) >= FREEMIUM_LIMIT;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Create a new goal</h1>
      <NewGoalWizard isLocked={isLocked} />
    </div>
  );
}
