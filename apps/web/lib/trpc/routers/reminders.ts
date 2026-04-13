import { protectedProcedure, router } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export interface ReminderRow {
  id: string;
  goal_id: string;
  user_id: string;
  channel: "email" | "push";
  schedule: string;
  enabled: boolean;
  last_fired_at: Date | null;
}

const VALID_CHANNELS = ["email", "push"] as const;

// Minimal cron validation: "m h * * *" patterns only (we don't need full cron parsing here)
const CronSchema = z
  .string()
  .regex(
    /^(\*|[0-5]?\d)\s+(\*|[01]?\d|2[0-3])\s+\*\s+\*\s+(\*|[0-6])$/,
    'Invalid cron. Use "M H * * DOW" format, e.g. "0 9 * * 1-5"'
  );

export const remindersRouter = router({
  /** List all reminders for the current user */
  list: protectedProcedure
    .input(z.object({ goalId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      if (input.goalId) {
        return ctx.withUserContext!<ReminderRow[]>((tx) => tx<ReminderRow[]>`
          SELECT r.*
          FROM reminders r
          JOIN goals g ON g.id = r.goal_id
          WHERE r.user_id = ${userId} AND r.goal_id = ${input.goalId!}
          ORDER BY r.goal_id
        `);
      }
      return ctx.withUserContext!<ReminderRow[]>((tx) => tx<ReminderRow[]>`
        SELECT r.*
        FROM reminders r
        WHERE r.user_id = ${userId}
        ORDER BY r.goal_id
      `);
    }),

  /** Create or upsert a reminder for a goal (one per channel per goal) */
  upsert: protectedProcedure
    .input(
      z.object({
        goalId: z.string().uuid(),
        channel: z.enum(VALID_CHANNELS).default("email"),
        schedule: CronSchema,
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify goal ownership
      const [goal] = await ctx.db<{ id: string }[]>`
        SELECT id FROM goals WHERE id = ${input.goalId} AND owner_user_id = ${userId}
      `;
      if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });

      const rows = await ctx.withUserContext!<ReminderRow[]>((tx) => tx<ReminderRow[]>`
        INSERT INTO reminders (goal_id, user_id, channel, schedule, enabled)
        VALUES (${input.goalId}, ${userId}, ${input.channel}, ${input.schedule}, ${input.enabled})
        ON CONFLICT (goal_id, user_id, channel)
        DO UPDATE SET
          schedule = EXCLUDED.schedule,
          enabled  = EXCLUDED.enabled
        RETURNING *
      `);
      return rows[0]!;
    }),

  /** Toggle a reminder on/off */
  toggle: protectedProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows = await ctx.withUserContext!<ReminderRow[]>((tx) => tx<ReminderRow[]>`
        UPDATE reminders
        SET enabled = ${input.enabled}
        WHERE id = ${input.id} AND user_id = ${userId}
        RETURNING *
      `);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  /** Delete a reminder */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.withUserContext!<object[]>((tx) => tx`
        DELETE FROM reminders WHERE id = ${input.id} AND user_id = ${userId}
      `);
      return { ok: true };
    }),
});
