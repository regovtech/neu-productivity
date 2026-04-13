import { protectedProcedure, router } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

const FREEMIUM_GOAL_LIMIT = 3;

const GoalCategorySchema = z.enum([
  "health",
  "work",
  "learning",
  "finance",
  "other",
]);

const GoalCadenceSchema = z.enum(["daily", "weekly"]);

const GoalStatusSchema = z.enum(["active", "paused", "achieved", "abandoned"]);

export type GoalCategory = z.infer<typeof GoalCategorySchema>;
export type GoalCadence = z.infer<typeof GoalCadenceSchema>;
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export interface GoalRow {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  assigned_by_user_id: string | null;
  title: string;
  description: string | null;
  category: GoalCategory;
  numeric_target: number;
  unit: string;
  cadence: GoalCadence;
  target_date: string;
  is_mandatory: boolean;
  status: GoalStatus;
  created_at: Date;
  updated_at: Date;
}

export const goalsRouter = router({
  /** List goals for the current user's personal workspace */
  list: protectedProcedure
    .input(
      z
        .object({
          status: GoalStatusSchema.optional(),
          workspaceId: z.string().uuid().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const statusFilter = input?.status;
      const wsFilter = input?.workspaceId;

      return ctx.withUserContext!<GoalRow[]>((tx) => {
        if (statusFilter && wsFilter) {
          return tx<GoalRow[]>`
            SELECT g.*
            FROM goals g
            JOIN workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = ${userId}
            WHERE g.owner_user_id = ${userId}
              AND g.status = ${statusFilter}
              AND g.workspace_id = ${wsFilter}
            ORDER BY g.created_at DESC
          `;
        }
        if (statusFilter) {
          return tx<GoalRow[]>`
            SELECT g.*
            FROM goals g
            JOIN workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = ${userId}
            WHERE g.owner_user_id = ${userId}
              AND g.status = ${statusFilter}
            ORDER BY g.created_at DESC
          `;
        }
        if (wsFilter) {
          return tx<GoalRow[]>`
            SELECT g.*
            FROM goals g
            JOIN workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = ${userId}
            WHERE g.owner_user_id = ${userId}
              AND g.workspace_id = ${wsFilter}
            ORDER BY g.status ASC, g.created_at DESC
          `;
        }
        return tx<GoalRow[]>`
          SELECT g.*
          FROM goals g
          JOIN workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = ${userId}
          WHERE g.owner_user_id = ${userId}
          ORDER BY g.status ASC, g.created_at DESC
        `;
      });
    }),

  /** Get a single goal by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows = await ctx.withUserContext!<GoalRow[]>((tx) => tx<GoalRow[]>`
        SELECT g.*
        FROM goals g
        JOIN workspace_members wm ON wm.workspace_id = g.workspace_id AND wm.user_id = ${userId}
        WHERE g.id = ${input.id}
          AND g.owner_user_id = ${userId}
      `);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  /** Create a new goal (with freemium gate) */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        category: GoalCategorySchema,
        numericTarget: z.number().positive(),
        unit: z.string().min(1).max(50),
        cadence: GoalCadenceSchema,
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
        workspaceId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Resolve workspace outside the RLS transaction (service-mode lookup)
      const [ws] = await ctx.db<{ id: string; plan: string }[]>`
        SELECT w.id, w.plan
        FROM workspaces w
        JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${userId}
        WHERE ${input.workspaceId ? ctx.db`w.id = ${input.workspaceId}` : ctx.db`w.kind = 'personal'`}
        LIMIT 1
      `;
      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      // Freemium gate: count active + paused goals in this workspace for the user
      if (ws.plan === "free") {
        const [{ count }] = await ctx.db<{ count: string }[]>`
          SELECT COUNT(*)::text AS count
          FROM goals
          WHERE workspace_id = ${ws.id}
            AND owner_user_id = ${userId}
            AND status IN ('active', 'paused')
        `;
        if (parseInt(count, 10) >= FREEMIUM_GOAL_LIMIT) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Free plan allows up to ${FREEMIUM_GOAL_LIMIT} goals. Upgrade to create more.`,
          });
        }
      }

      const rows = await ctx.withUserContext!<GoalRow[]>((tx) => tx<GoalRow[]>`
        INSERT INTO goals (
          workspace_id, owner_user_id, title, description,
          category, numeric_target, unit, cadence, target_date
        ) VALUES (
          ${ws.id}, ${userId}, ${input.title}, ${input.description ?? null},
          ${input.category}, ${input.numericTarget}, ${input.unit},
          ${input.cadence}, ${input.targetDate}
        )
        RETURNING *
      `);
      return rows[0]!;
    }),

  /** Update goal metadata */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
        category: GoalCategorySchema.optional(),
        numericTarget: z.number().positive().optional(),
        unit: z.string().min(1).max(50).optional(),
        cadence: GoalCadenceSchema.optional(),
        targetDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify ownership
      const existing = await ctx.db<{ id: string }[]>`
        SELECT id FROM goals WHERE id = ${input.id} AND owner_user_id = ${userId}
      `;
      if (!existing[0]) throw new TRPCError({ code: "NOT_FOUND" });

      const title = input.title;
      const description = input.description;
      const category = input.category;
      const numericTarget = input.numericTarget;
      const unit = input.unit;
      const cadence = input.cadence;
      const targetDate = input.targetDate;

      const rows = await ctx.withUserContext!<GoalRow[]>((tx) => tx<GoalRow[]>`
        UPDATE goals SET
          title          = COALESCE(${title ?? null}, title),
          description    = CASE WHEN ${description !== undefined} THEN ${description ?? null}::text ELSE description END,
          category       = COALESCE(${category ?? null}, category),
          numeric_target = COALESCE(${numericTarget ?? null}, numeric_target),
          unit           = COALESCE(${unit ?? null}, unit),
          cadence        = COALESCE(${cadence ?? null}, cadence),
          target_date    = COALESCE(${targetDate ?? null}, target_date),
          updated_at     = now()
        WHERE id = ${input.id} AND owner_user_id = ${userId}
        RETURNING *
      `);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  /** Update goal status (pause / achieve / abandon / reactivate) */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: GoalStatusSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows = await ctx.withUserContext!<GoalRow[]>((tx) => tx<GoalRow[]>`
        UPDATE goals
        SET status = ${input.status}, updated_at = now()
        WHERE id = ${input.id}
          AND owner_user_id = ${userId}
          AND (is_mandatory = false OR ${input.status} = 'paused')
        RETURNING *
      `);
      if (!rows[0]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot update status. Goal not found or is mandatory.",
        });
      }
      return rows[0];
    }),
});
