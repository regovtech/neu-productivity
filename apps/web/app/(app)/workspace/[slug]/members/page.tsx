import { MembersPage } from "./MembersPage";
import { sql } from "@/lib/db/client";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";

export default async function WorkspaceMembersPage({
  params,
}: {
  params: { slug: string };
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  // Resolve workspace ID for client component (so it can call invites.list)
  const [ws] = await sql<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${session.user.id}
    WHERE w.slug = ${params.slug}
  `;
  if (!ws) notFound();

  return <MembersPage slug={params.slug} workspaceId={ws.id} />;
}
