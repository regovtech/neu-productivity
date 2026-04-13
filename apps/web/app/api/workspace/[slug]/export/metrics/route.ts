/**
 * GET /api/workspace/[slug]/export/metrics
 * Returns a CSV of all team members' goal metrics for the workspace.
 * Requires the caller to be an authenticated owner/admin/manager.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { sql } from "@/lib/db/client";

type ExportRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  department_name: string | null;
  role: string;
  goal_id: string;
  goal_title: string;
  category: string;
  cadence: string;
  numeric_target: number;
  unit: string;
  status: string;
  target_date: string;
  is_mandatory: boolean;
  checkin_count: number;
  last_checkin_value: number | null;
  last_checkin_at: Date | null;
};

function toCSV(rows: ExportRow[]): string {
  const headers = [
    "user_id",
    "email",
    "display_name",
    "department",
    "role",
    "goal_id",
    "goal_title",
    "category",
    "cadence",
    "numeric_target",
    "unit",
    "status",
    "target_date",
    "is_mandatory",
    "checkin_count",
    "last_checkin_value",
    "last_checkin_at",
  ];

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.user_id,
        r.email,
        r.display_name,
        r.department_name,
        r.role,
        r.goal_id,
        r.goal_title,
        r.category,
        r.cadence,
        r.numeric_target,
        r.unit,
        r.status,
        r.target_date,
        r.is_mandatory,
        r.checkin_count,
        r.last_checkin_value,
        r.last_checkin_at instanceof Date
          ? r.last_checkin_at.toISOString()
          : (r.last_checkin_at ?? ""),
      ]
        .map(escape)
        .join(",")
    ),
  ];

  return lines.join("\r\n");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Verify caller is manager+ in this workspace
  const [ws] = await sql<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${userId}
    WHERE w.slug = ${slug}
      AND wm.role IN ('owner', 'admin', 'manager')
  `;
  if (!ws) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await sql<ExportRow[]>`
    SELECT
      wm.user_id,
      u.email,
      u.display_name,
      d.name       AS department_name,
      wm.role,
      g.id         AS goal_id,
      g.title      AS goal_title,
      g.category,
      g.cadence,
      g.numeric_target,
      g.unit,
      g.status,
      g.target_date,
      g.is_mandatory,
      COUNT(ci.id)::int        AS checkin_count,
      ci_last.value            AS last_checkin_value,
      ci_last.checked_at       AS last_checkin_at
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    LEFT JOIN departments d ON d.id = wm.department_id
    JOIN goals g
      ON g.workspace_id = wm.workspace_id
      AND g.owner_user_id = wm.user_id
    LEFT JOIN check_ins ci ON ci.goal_id = g.id
    LEFT JOIN LATERAL (
      SELECT value, checked_at
      FROM check_ins
      WHERE goal_id = g.id
      ORDER BY checked_at DESC
      LIMIT 1
    ) ci_last ON true
    WHERE wm.workspace_id = ${ws.id}
    GROUP BY
      wm.user_id, u.email, u.display_name, d.name, wm.role,
      g.id, g.title, g.category, g.cadence, g.numeric_target, g.unit,
      g.status, g.target_date, g.is_mandatory,
      ci_last.value, ci_last.checked_at
    ORDER BY u.email ASC, g.created_at ASC
  `;

  const csv = toCSV(rows);
  const filename = `neurify-metrics-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
