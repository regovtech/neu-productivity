import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { sql } from "@/lib/db/client";
import { sendEmail, renderInviteEmail } from "@/lib/email/resend";
import { env } from "@/lib/env";

interface ImportRow {
  email: string;
  role: string;
}

interface ImportResult {
  email: string;
  status: "invited" | "skipped" | "error";
  reason?: string;
}

const VALID_ROLES = new Set(["owner", "admin", "manager", "member"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const workspaceId: string = body.workspaceId;
  const rows: ImportRow[] = body.rows ?? [];

  if (!workspaceId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Verify caller is owner/admin
  const [member] = await sql<{ role: string }[]>`
    SELECT role FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${session.user.id}
      AND role IN ('owner', 'admin')
  `;
  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [ws] = await sql<{ name: string }[]>`
    SELECT name FROM workspaces WHERE id = ${workspaceId}
  `;
  const [inviter] = await sql<{ display_name: string | null; email: string }[]>`
    SELECT display_name, email FROM users WHERE id = ${session.user.id}
  `;

  const results: ImportResult[] = [];

  for (const row of rows.slice(0, 500)) {
    const email = (row.email ?? "").trim().toLowerCase();
    const role = VALID_ROLES.has(row.role) ? row.role : "member";

    if (!email || !EMAIL_RE.test(email)) {
      results.push({ email: email || "(empty)", status: "error", reason: "invalid email" });
      continue;
    }

    // Check if already a member
    const [existingMember] = await sql<{ user_id: string }[]>`
      SELECT wm.user_id FROM workspace_members wm
      JOIN users u ON u.id = wm.user_id
      WHERE wm.workspace_id = ${workspaceId} AND u.email = ${email}
    `;
    if (existingMember) {
      results.push({ email, status: "skipped", reason: "already a member" });
      continue;
    }

    // Check for existing pending invite
    const [existingInvite] = await sql<{ id: string }[]>`
      SELECT id FROM invite_tokens
      WHERE workspace_id = ${workspaceId} AND email = ${email}
        AND accepted_at IS NULL AND expires_at > now()
    `;
    if (existingInvite) {
      results.push({ email, status: "skipped", reason: "invite already pending" });
      continue;
    }

    try {
      const [invite] = await sql<{ token: string }[]>`
        INSERT INTO invite_tokens (workspace_id, invited_by, email, role)
        VALUES (${workspaceId}, ${session.user.id}, ${email}, ${role})
        RETURNING token
      `;

      const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${invite!.token}`;
      const tmpl = renderInviteEmail({
        workspaceName: ws?.name ?? "your workspace",
        inviterName: inviter?.display_name ?? inviter?.email ?? "A teammate",
        acceptUrl,
      });
      await sendEmail({ to: email, ...tmpl });

      results.push({ email, status: "invited" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      results.push({ email, status: "error", reason: msg });
    }
  }

  return NextResponse.json(results);
}
