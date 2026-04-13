import { protectedProcedure, router } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { GoalCadence, GoalRow } from "./goals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckInRow {
  id: string;
  goal_id: string;
  user_id: string;
  workspace_id: string;
  value: number;
  note: string | null;
  checked_at: Date;
}

// ---------------------------------------------------------------------------
// Pure calculation helpers (no DB side-effects)
// ---------------------------------------------------------------------------

/**
 * Progress percentage: (latest check-in value / numeric_target) × 100.
 */
export function calcProgressPct(
  goal: Pick<GoalRow, "numeric_target">,
  checkIns: Pick<CheckInRow, "value" | "checked_at">[]
): number {
  if (checkIns.length === 0) return 0;
  const latest = checkIns.reduce((a, b) =>
    new Date(a.checked_at) >= new Date(b.checked_at) ? a : b
  );
  return (Number(latest.value) / Number(goal.numeric_target)) * 100;
}

/**
 * Current streak: consecutive periods (day or week) ending today with ≥1 check-in.
 */
export function calcStreak(
  checkIns: Pick<CheckInRow, "checked_at">[],
  cadence: GoalCadence,
  now: Date = new Date()
): number {
  if (checkIns.length === 0) return 0;

  const periodKey =
    cadence === "daily"
      ? (d: Date) => d.toISOString().slice(0, 10)
      : (d: Date) => {
          const jan4 = new Date(d.getFullYear(), 0, 4);
          const weekNo = Math.ceil(
            ((d.getTime() - jan4.getTime()) / 86_400_000 + jan4.getDay() + 1) / 7
          );
          return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
        };

  const presentPeriods = new Set(
    checkIns.map((c) => periodKey(new Date(c.checked_at)))
  );

  let streak = 0;
  const cursor = new Date(now);

  while (true) {
    const key = periodKey(cursor);
    if (!presentPeriods.has(key)) break;
    streak++;
    if (cadence === "daily") {
      cursor.setDate(cursor.getDate() - 1);
    } else {
      cursor.setDate(cursor.getDate() - 7);
    }
  }

  return streak;
}

/**
 * Projected completion date based on linear extrapolation.
 * Returns null if there are fewer than 2 check-ins or no positive trend.
 */
export function calcProjectedCompletion(
  goal: Pick<GoalRow, "numeric_target" | "cadence">,
  checkIns: Pick<CheckInRow, "value" | "checked_at">[]
): Date | null {
  if (checkIns.length < 2) return null;

  const sorted = [...checkIns].sort(
    (a, b) => new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
  );

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const elapsed = new Date(last.checked_at).getTime() - new Date(first.checked_at).getTime();
  if (elapsed === 0) return null;

  const valueGain = Number(last.value) - Number(first.value);
  if (valueGain <= 0) return null;

  const remaining = Number(goal.numeric_target) - Number(last.value);
  if (remaining <= 0) return new Date(last.checked_at);

  const msRemaining = (remaining / valueGain) * elapsed;
  return new Date(new Date(last.checked_at).getTime() + msRemaining);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const checkInsRouter = router({
  /** List check-ins for a goal, optionally filtered by date range */
  list: protectedProcedure
    .input(
      z.object({
        goalId: z.string().uuid(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().positive().max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { goalId, from, to, limit } = input;

      return ctx.withUserContext!<CheckInRow[]>((tx) => {
        if (from && to) {
          return tx<CheckInRow[]>`
            SELECT * FROM check_ins
            WHERE goal_id = ${goalId} AND user_id = ${userId}
              AND checked_at >= ${from}::timestamptz
              AND checked_at <= ${to}::timestamptz
            ORDER BY checked_at DESC LIMIT ${limit}
          `;
        }
        if (from) {
          return tx<CheckInRow[]>`
            SELECT * FROM check_ins
            WHERE goal_id = ${goalId} AND user_id = ${userId}
              AND checked_at >= ${from}::timestamptz
            ORDER BY checked_at DESC LIMIT ${limit}
          `;
        }
        return tx<CheckInRow[]>`
          SELECT * FROM check_ins
          WHERE goal_id = ${goalId} AND user_id = ${userId}
          ORDER BY checked_at DESC LIMIT ${limit}
        `;
      });
    }),

  /** Get the latest check-in for each of the provided goal IDs (dashboard batch) */
  latestByGoals: protectedProcedure
    .input(z.object({ goalIds: z.array(z.string().uuid()).max(50) }))
    .query(async ({ ctx, input }) => {
      if (input.goalIds.length === 0) return [] as CheckInRow[];
      const userId = ctx.session.user.id;
      return ctx.withUserContext!<CheckInRow[]>((tx) => tx<CheckInRow[]>`
        SELECT DISTINCT ON (goal_id) *
        FROM check_ins
        WHERE goal_id = ANY(${input.goalIds}::uuid[])
          AND user_id = ${userId}
        ORDER BY goal_id, checked_at DESC
      `);
    }),

  /** Create a check-in for a goal */
  create: protectedProcedure
    .input(
      z.object({
        goalId: z.string().uuid(),
        value: z.number().positive(),
        note: z.string().max(500).optional(),
        checkedAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify goal ownership and get workspace_id (service mode — no RLS needed here)
      const [goal] = await ctx.db<{ id: string; workspace_id: string; status: string }[]>`
        SELECT id, workspace_id, status FROM goals
        WHERE id = ${input.goalId} AND owner_user_id = ${userId}
      `;
      if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
      if (goal.status === "achieved" || goal.status === "abandoned") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot check in on a completed or abandoned goal",
        });
      }

      const checkedAt = input.checkedAt ?? new Date().toISOString();
      const rows = await ctx.withUserContext!<CheckInRow[]>((tx) => tx<CheckInRow[]>`
        INSERT INTO check_ins (goal_id, user_id, workspace_id, value, note, checked_at)
        VALUES (
          ${input.goalId}, ${userId}, ${goal.workspace_id},
          ${input.value}, ${input.note ?? null}, ${checkedAt}::timestamptz
        )
        RETURNING *
      `);
      return rows[0]!;
    }),

  /**
   * Computed stats for a goal: progress %, streak, projected completion.
   * Fetches last 365 days of check-ins for streak accuracy.
   */
  stats: protectedProcedure
    .input(z.object({ goalId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [goal] = await ctx.db<GoalRow[]>`
        SELECT * FROM goals WHERE id = ${input.goalId} AND owner_user_id = ${userId}
      `;
      if (!goal) throw new TRPCError({ code: "NOT_FOUND" });

      const checkIns = await ctx.withUserContext!<CheckInRow[]>((tx) => tx<CheckInRow[]>`
        SELECT * FROM check_ins
        WHERE goal_id = ${input.goalId} AND user_id = ${userId}
          AND checked_at >= now() - INTERVAL '365 days'
        ORDER BY checked_at DESC
      `);

      return {
        progressPct: calcProgressPct(goal, checkIns),
        streak: calcStreak(checkIns, goal.cadence as GoalCadence),
        projectedCompletion: calcProjectedCompletion(goal, checkIns),
        totalCheckIns: checkIns.length,
        latestValue: checkIns[0]?.value ?? null,
        latestCheckedAt: checkIns[0]?.checked_at ?? null,
      };
    }),
});
