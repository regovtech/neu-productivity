/**
 * POST /api/cron/gdpr-hard-delete
 * Permanently deletes users whose 30-day soft-delete window has elapsed.
 *
 * Called by a cron scheduler (Vercel Cron, Railway, or external scheduler).
 * Secured by CRON_SECRET environment variable.
 *
 * Vercel cron config (vercel.json):
 *   { "path": "/api/cron/gdpr-hard-delete", "schedule": "0 3 * * *" }
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db/client";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Select and lock eligible deletion queue entries
  const eligible = await sql<{ user_id: string; id: string }[]>`
    SELECT id, user_id
    FROM user_deletion_queue
    WHERE execute_after <= now()
      AND executed_at IS NULL
    FOR UPDATE SKIP LOCKED
  `;

  if (eligible.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  let deleted = 0;
  const errors: string[] = [];

  for (const row of eligible) {
    try {
      // Hard-delete the user; CASCADE handles all dependent rows
      await sql`DELETE FROM users WHERE id = ${row.user_id}`;
      // Mark the queue entry as executed (user cascade may already remove it)
      await sql`
        UPDATE user_deletion_queue
        SET executed_at = now()
        WHERE id = ${row.id}
      `.catch(() => {
        // Queue row may already be cascade-deleted; that's fine
      });
      deleted++;
    } catch (err) {
      errors.push(`user_id=${row.user_id}: ${String(err)}`);
    }
  }

  return NextResponse.json({ deleted, errors: errors.length > 0 ? errors : undefined });
}
