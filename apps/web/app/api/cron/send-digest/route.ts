/**
 * POST /api/cron/send-digest
 * Sends the weekly manager digest to all opted-in workspaces whose
 * preferred send-hour matches the current UTC hour.
 *
 * Runs hourly on Mondays via Vercel Cron (schedule: "0 * * * 1").
 * Secured by the CRON_SECRET environment variable.
 *
 * Vercel cron config (vercel.json):
 *   { "path": "/api/cron/send-digest", "schedule": "0 * * * 1" }
 *
 * Skip conditions:
 *   - digest_enabled = false
 *   - digest_hour ≠ current UTC hour
 *   - workspace has zero active goals
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";
import { sendManagerDigest } from "@/lib/email/resend";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUtcHour = new Date().getUTCHours();

  // Find all workspaces that have opted in and match the current UTC hour,
  // with at least one active goal.
  const eligible = await sql<{ id: string; name: string }[]>`
    SELECT DISTINCT w.id, w.name
    FROM workspaces w
    WHERE w.digest_enabled = true
      AND w.digest_hour = ${currentUtcHour}
      AND EXISTS (
        SELECT 1 FROM goals g
        WHERE g.workspace_id = w.id AND g.status = 'active'
      )
  `;

  if (eligible.length === 0) {
    return NextResponse.json({ sent: 0, workspaces: 0 });
  }

  let totalSent = 0;
  const results: Array<{ workspaceId: string; name: string; sent: number; error?: string }> = [];

  for (const ws of eligible) {
    try {
      const sent = await sendManagerDigest(sql, ws.id);
      totalSent += sent;
      results.push({ workspaceId: ws.id, name: ws.name, sent });
    } catch (err) {
      console.error(`send-digest: failed for workspace ${ws.id}`, err);
      results.push({
        workspaceId: ws.id,
        name: ws.name,
        sent: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ sent: totalSent, workspaces: eligible.length, results });
}
