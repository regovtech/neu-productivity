import { CsvImportForm } from "./CsvImportForm";
import { sql } from "@/lib/db/client";
import { auth } from "@/lib/auth/config";
import { notFound } from "next/navigation";

export default async function CsvImportPage({ params }: { params: { slug: string } }) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const [ws] = await sql<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id
      AND wm.user_id = ${session.user.id}
      AND wm.role IN ('owner', 'admin')
    WHERE w.slug = ${params.slug}
  `;
  if (!ws) notFound();

  return (
    <div>
      <h1 className="mb-2 text-xl font-bold text-gray-900">Bulk CSV import</h1>
      <p className="mb-6 text-sm text-gray-500">
        Upload a CSV file to invite multiple employees at once. Each invitee receives an email.
      </p>
      <CsvImportForm workspaceId={ws.id} />
    </div>
  );
}
