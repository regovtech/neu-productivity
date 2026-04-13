import { sql } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { DepartmentsPage } from "./DepartmentsPage";

export default async function WorkspaceDepartmentsPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const [ws] = await sql<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${session.user.id}
    WHERE w.slug = ${params.slug}
      AND wm.role IN ('owner', 'admin', 'manager')
  `;
  if (!ws) notFound();

  return <DepartmentsPage workspaceId={ws.id} />;
}
