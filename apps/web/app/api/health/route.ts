/**
 * GET /api/health
 *
 * Lightweight health check — verifies DB connectivity without RLS overhead.
 * Used by: uptime monitors, smoke test, Vercel preview deployment checks.
 * Returns 200 with { ok: true } on success, 503 on DB error.
 */
import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

export async function GET() {
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "DB unreachable" }, { status: 503 });
  }
}
