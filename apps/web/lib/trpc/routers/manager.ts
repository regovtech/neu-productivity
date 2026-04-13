/**
 * Manager router — goal templates, team goal assignment, team dashboard,
 * CSV export, and weekly digest trigger.
 *
 * All procedures require the caller to be owner/admin/manager of the target workspace.
 */
import { protectedProcedure, router } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAuditEvent, AuditEvent } from "@/lib/audit";
import type { GoalCategory, GoalCadence } from "./goals";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateRow {
  id: string;
  workspace_id: string;
  created_by: string;
  title: string;
  description: string | null;
  category: GoalCategory;
  numeric_target: number;
  unit: string;
  cadence: GoalCadence;
  is_mandatory: boolean;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

const GoalCategorySchema = z.enum(["health", "work", "learning", "finance", "other"]);
const GoalCadenceSchema = z.enum(["daily", "weekly"]);

// ---------------------------------------------------------------------------
// Guard helper
// ---------------------------------------------------------------------------

async function requireManagerRole(
  db: Parameters<typeof writeAuditEvent>[0],
  workspaceId: string,
  userId: string
): Promise<{ role: string }> {
  const rows = await db<{ role: string }[]>`
    SELECT role FROM workspace_members
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      AND role IN ('owner', 'admin', 'manager')
  `;
  if (!rows[0]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only managers and above can perform this action",
    });
  }
  return rows[0];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const managerRouter = router({
  // -------------------------------------------------------------------------
  // Goal Templates
  // -------------------------------------------------------------------------

  /** List goal templates for a workspace */
  listTemplates: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireManagerRole(ctx.db, input.workspaceId, userId);

      return ctx.withUserContext!<TemplateRow[]>((tx) => tx<TemplateRow[]>`
        SELECT * FROM goal_templates
        WHERE workspace_id = ${input.workspaceId}
          AND archived_at IS NULL
        ORDER BY created_at DESC
      `);
    }),

  /** Create a goal template */
  createTemplate: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        category: GoalCategorySchema,
        numericTarget: z.number().positive(),
        unit: z.string().min(1).max(50),
        cadence: GoalCadenceSchema,
        isMandatory: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireManagerRole(ctx.db, input.workspaceId, userId);

      const [tmpl] = await ctx.db<TemplateRow[]>`
        INSERT INTO goal_templates
          (workspace_id, created_by, title, description, category,
           numeric_target, unit, cadence, is_mandatory)
        VALUES (
          ${input.workspaceId}, ${userId}, ${input.title},
          ${input.description ?? null}, ${input.category},
          ${input.numericTarget}, ${input.unit}, ${input.cadence},
          ${input.isMandatory}
        )
        RETURNING *
      `;

      await writeAuditEvent(ctx.db, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        eventType: AuditEvent.TEMPLATE_CREATED,
        targetType: "goal_template",
        targetId: tmpl!.id,
        payload: { title: input.title, isMandatory: input.isMandatory },
      });

      return tmpl!;
    }),

  /** Archive a goal template (soft delete) */
  archiveTemplate: protectedProcedure
    .input(z.object({ templateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [tmpl] = await ctx.db<TemplateRow[]>`
        SELECT * FROM goal_templates WHERE id = ${input.templateId}
      `;
      if (!tmpl) throw new TRPCError({ code: "NOT_FOUND" });
      await requireManagerRole(ctx.db, tmpl.workspace_id, userId);

      await ctx.db`
        UPDATE goal_templates SET archived_at = now() WHERE id = ${input.templateId}
      `;
      return { ok: true };
    }),

  // -------------------------------------------------------------------------
  // Goal Assignment
  // -------------------------------------------------------------------------

  /**
   * Assign a goal (from template or ad-hoc) to one or more members.
   * Creates a `goals` row for each target user.
   */
  assignGoal: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        /** Optionally hydrate fields from a template */
        templateId: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        description: z.string().max(1000).optional(),
        category: GoalCategorySchema,
        numericTarget: z.number().positive(),
        unit: z.string().min(1).max(50),
        cadence: GoalCadenceSchema,
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        isMandatory: z.boolean().default(false),
        /** Target individual members */
        targetUserIds: z.array(z.string().uuid()).optional(),
        /** Or target an entire department */
        targetDepartmentId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireManagerRole(ctx.db, input.workspaceId, userId);

      // Resolve target user list
      let targetUserIds: string[] = input.targetUserIds ?? [];

      if (input.targetDepartmentId) {
        const deptMembers = await ctx.db<{ user_id: string }[]>`
          SELECT user_id FROM workspace_members
          WHERE workspace_id = ${input.workspaceId}
            AND department_id = ${input.targetDepartmentId}
        `;
        const deptUserIds = deptMembers.map((m) => m.user_id);
        // Merge with any explicit targets, dedupe
        const seen = new Set(targetUserIds);
        deptUserIds.forEach((id) => seen.add(id));
        targetUserIds = Array.from(seen);
      }

      if (targetUserIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must specify targetUserIds or targetDepartmentId with members",
        });
      }

      // Verify all targets are workspace members
      const members = await ctx.db<{ user_id: string }[]>`
        SELECT user_id FROM workspace_members
        WHERE workspace_id = ${input.workspaceId}
          AND user_id = ANY(${targetUserIds}::uuid[])
      `;
      if (members.length !== targetUserIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more target users are not workspace members",
        });
      }

      // Insert one goal per target
      const createdGoals: Array<{ id: string; owner_user_id: string }> = [];
      for (const targetUserId of targetUserIds) {
        const [goal] = await ctx.db<{ id: string; owner_user_id: string }[]>`
          INSERT INTO goals (
            workspace_id, owner_user_id, assigned_by_user_id,
            title, description, category, numeric_target, unit,
            cadence, target_date, is_mandatory
          ) VALUES (
            ${input.workspaceId}, ${targetUserId}, ${userId},
            ${input.title}, ${input.description ?? null},
            ${input.category}, ${input.numericTarget}, ${input.unit},
            ${input.cadence}, ${input.targetDate}, ${input.isMandatory}
          )
          RETURNING id, owner_user_id
        `;
        createdGoals.push(goal!);
      }

      await writeAuditEvent(ctx.db, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        eventType: AuditEvent.GOAL_ASSIGNED,
        targetType: "goal_batch",
        payload: {
          goalIds: createdGoals.map((g) => g.id),
          targetUserIds,
          templateId: input.templateId,
          isMandatory: input.isMandatory,
        },
      });

      return { created: createdGoals.length, goalIds: createdGoals.map((g) => g.id) };
    }),

  // -------------------------------------------------------------------------
  // Team Dashboard
  // -------------------------------------------------------------------------

  /**
   * Team dashboard: completion %, current streak, at-risk flag per member.
   * "At-risk" = member has ≥1 active goal with no check-in in the last
   * check-in period (daily → 1 day, weekly → 7 days).
   */
  teamDashboard: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireManagerRole(ctx.db, input.workspaceId, userId);

      type MemberStat = {
        user_id: string;
        email: string;
        display_name: string | null;
        role: string;
        department_id: string | null;
        department_name: string | null;
        total_goals: number;
        completed_goals: number;
        completion_pct: number;
        current_streak: number;
        is_at_risk: boolean;
        last_checkin_at: Date | null;
      };

      const rows = await ctx.withUserContext!<MemberStat[]>((tx) => tx<MemberStat[]>`
        WITH member_goals AS (
          SELECT
            g.owner_user_id,
            COUNT(*) FILTER (WHERE g.status IN ('active', 'paused', 'achieved')) AS total_goals,
            COUNT(*) FILTER (WHERE g.status = 'achieved') AS completed_goals,
            -- At-risk: has an active goal with no recent check-in
            BOOL_OR(
              g.status = 'active' AND NOT EXISTS (
                SELECT 1 FROM check_ins ci
                WHERE ci.goal_id = g.id
                  AND ci.checked_at >= CASE g.cadence
                    WHEN 'daily'  THEN now() - INTERVAL '1 day'
                    WHEN 'weekly' THEN now() - INTERVAL '7 days'
                    ELSE now() - INTERVAL '1 day'
                  END
              )
            ) AS is_at_risk
          FROM goals g
          WHERE g.workspace_id = ${input.workspaceId}
          GROUP BY g.owner_user_id
        ),
        last_checkins AS (
          SELECT user_id, MAX(checked_at) AS last_checkin_at
          FROM check_ins
          WHERE workspace_id = ${input.workspaceId}
          GROUP BY user_id
        ),
        streaks AS (
          -- Daily streak: consecutive days with at least one check-in
          SELECT
            ci.user_id,
            COUNT(DISTINCT ci.checked_at::date) FILTER (
              WHERE ci.checked_at::date >= (
                SELECT d FROM (
                  SELECT generate_series(0, 365) AS n
                ) s
                CROSS JOIN LATERAL (
                  SELECT (now()::date - s.n)::date AS d
                ) g
                WHERE NOT EXISTS (
                  SELECT 1 FROM check_ins ci2
                  WHERE ci2.user_id = ci.user_id
                    AND ci2.workspace_id = ${input.workspaceId}
                    AND ci2.checked_at::date = g.d
                )
                ORDER BY d DESC
                LIMIT 1
              )
            ) AS current_streak
          FROM check_ins ci
          WHERE ci.workspace_id = ${input.workspaceId}
          GROUP BY ci.user_id
        )
        SELECT
          wm.user_id,
          u.email,
          u.display_name,
          wm.role,
          wm.department_id,
          d.name AS department_name,
          COALESCE(mg.total_goals, 0)::int       AS total_goals,
          COALESCE(mg.completed_goals, 0)::int   AS completed_goals,
          CASE
            WHEN COALESCE(mg.total_goals, 0) = 0 THEN 0
            ELSE ROUND(
              COALESCE(mg.completed_goals, 0)::numeric
              / COALESCE(mg.total_goals, 1)::numeric * 100
            )::int
          END AS completion_pct,
          COALESCE(st.current_streak, 0)::int    AS current_streak,
          COALESCE(mg.is_at_risk, false)          AS is_at_risk,
          lc.last_checkin_at
        FROM workspace_members wm
        JOIN users u ON u.id = wm.user_id
        LEFT JOIN departments d ON d.id = wm.department_id
        LEFT JOIN member_goals mg ON mg.owner_user_id = wm.user_id
        LEFT JOIN last_checkins lc ON lc.user_id = wm.user_id
        LEFT JOIN streaks st ON st.user_id = wm.user_id
        WHERE wm.workspace_id = ${input.workspaceId}
        ORDER BY mg.is_at_risk DESC NULLS LAST, completion_pct ASC
      `);

      return rows;
    }),

  /**
   * Individual member drill-down: their goals + recent check-ins.
   */
  memberDrilldown: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        targetUserId: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireManagerRole(ctx.db, input.workspaceId, userId);

      // Verify target is in workspace
      const [target] = await ctx.db<{ user_id: string; email: string; display_name: string | null }[]>`
        SELECT wm.user_id, u.email, u.display_name
        FROM workspace_members wm
        JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${input.workspaceId} AND wm.user_id = ${input.targetUserId}
      `;
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      const goals = await ctx.withUserContext!<
        Array<{
          id: string;
          title: string;
          category: string;
          cadence: string;
          numeric_target: number;
          unit: string;
          status: string;
          target_date: string;
          is_mandatory: boolean;
          last_checkin_value: number | null;
          last_checkin_at: Date | null;
        }>
      >((tx) => tx`
        SELECT
          g.id,
          g.title,
          g.category,
          g.cadence,
          g.numeric_target,
          g.unit,
          g.status,
          g.target_date,
          g.is_mandatory,
          ci_last.value   AS last_checkin_value,
          ci_last.checked_at AS last_checkin_at
        FROM goals g
        LEFT JOIN LATERAL (
          SELECT value, checked_at
          FROM check_ins
          WHERE goal_id = g.id
          ORDER BY checked_at DESC
          LIMIT 1
        ) ci_last ON true
        WHERE g.workspace_id = ${input.workspaceId}
          AND g.owner_user_id = ${input.targetUserId}
        ORDER BY g.status ASC, g.created_at DESC
      `);

      return { member: target, goals };
    }),

  // -------------------------------------------------------------------------
  // CSV Export
  // -------------------------------------------------------------------------

  /** Returns raw data for CSV export (caller assembles CSV) */
  teamMetricsExport: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireManagerRole(ctx.db, input.workspaceId, userId);

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

      return ctx.withUserContext!<ExportRow[]>((tx) => tx<ExportRow[]>`
        SELECT
          wm.user_id,
          u.email,
          u.display_name,
          d.name   AS department_name,
          wm.role,
          g.id     AS goal_id,
          g.title  AS goal_title,
          g.category,
          g.cadence,
          g.numeric_target,
          g.unit,
          g.status,
          g.target_date,
          g.is_mandatory,
          COUNT(ci.id)::int          AS checkin_count,
          ci_last.value              AS last_checkin_value,
          ci_last.checked_at         AS last_checkin_at
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
        WHERE wm.workspace_id = ${input.workspaceId}
        GROUP BY
          wm.user_id, u.email, u.display_name, d.name, wm.role,
          g.id, g.title, g.category, g.cadence, g.numeric_target, g.unit,
          g.status, g.target_date, g.is_mandatory,
          ci_last.value, ci_last.checked_at
        ORDER BY u.email ASC, g.created_at ASC
      `);
    }),

  // -------------------------------------------------------------------------
  // Digest trigger
  // -------------------------------------------------------------------------

  /** Manually trigger the weekly manager digest for a workspace */
  sendDigest: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await requireManagerRole(ctx.db, input.workspaceId, userId);

      const { sendManagerDigest } = await import("@/lib/email/resend");
      const sent = await sendManagerDigest(ctx.db, input.workspaceId);
      return { sent };
    }),
});
