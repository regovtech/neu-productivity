import { protectedProcedure, router } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "company";
  plan: "free" | "trial" | "paid";
  trial_ends_at: Date | null;
  created_at: Date;
}

interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "manager" | "member";
  department: string | null;
  joined_at: Date;
}

const SlugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric with hyphens (e.g. acme-corp)"
  );

export const workspacesRouter = router({
  /** List workspaces the current user belongs to as owner or admin */
  me: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    return ctx.withUserContext!<WorkspaceRow[]>((tx) => tx<WorkspaceRow[]>`
      SELECT w.*
      FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ${userId}
        AND wm.role IN ('owner', 'admin')
      ORDER BY w.created_at DESC
    `);
  }),

  /** Get a single workspace by slug */
  get: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows = await ctx.withUserContext!<WorkspaceRow[]>((tx) => tx<WorkspaceRow[]>`
        SELECT w.*
        FROM workspaces w
        JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${userId}
        WHERE w.slug = ${input.slug}
      `);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  /** Check slug availability (debounce-friendly query) */
  checkSlug: protectedProcedure
    .input(z.object({ slug: SlugSchema }))
    .query(async ({ ctx, input }) => {
      const [existing] = await ctx.db<{ id: string }[]>`
        SELECT id FROM workspaces WHERE slug = ${input.slug} LIMIT 1
      `;
      return { available: !existing };
    }),

  /** Create a new company workspace */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: SlugSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Uniqueness check with clear error message
      const [existing] = await ctx.db<{ id: string }[]>`
        SELECT id FROM workspaces WHERE slug = ${input.slug} LIMIT 1
      `;
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `The slug "${input.slug}" is already taken. Please choose another.`,
        });
      }

      const rows = await ctx.db<WorkspaceRow[]>`
        WITH ws AS (
          INSERT INTO workspaces (slug, name, kind, plan)
          VALUES (${input.slug}, ${input.name}, 'company', 'free')
          RETURNING *
        ),
        _member AS (
          INSERT INTO workspace_members (workspace_id, user_id, role)
          SELECT ws.id, ${userId}, 'owner' FROM ws
        )
        SELECT * FROM ws
      `;
      return rows[0]!;
    }),

  /** Update workspace name */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Only owner/admin may update
      const [member] = await ctx.db<WorkspaceMemberRow[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.id} AND user_id = ${userId}
          AND role IN ('owner', 'admin')
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });

      const rows = await ctx.withUserContext!<WorkspaceRow[]>((tx) => tx<WorkspaceRow[]>`
        UPDATE workspaces SET name = ${input.name}
        WHERE id = ${input.id}
        RETURNING *
      `);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  /** List members of a workspace */
  members: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify caller is a member
      const [ws] = await ctx.db<{ id: string }[]>`
        SELECT w.id FROM workspaces w
        JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = ${userId}
        WHERE w.slug = ${input.slug}
      `;
      if (!ws) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.withUserContext!<
        (WorkspaceMemberRow & { email: string; display_name: string | null })[]
      >((tx) => tx<(WorkspaceMemberRow & { email: string; display_name: string | null })[]>`
        SELECT wm.*, u.email, u.display_name
        FROM workspace_members wm
        JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${ws.id}
        ORDER BY wm.joined_at ASC
      `);
    }),

  // -------------------------------------------------------------------------
  // Digest settings
  // -------------------------------------------------------------------------

  /** Get weekly digest settings for a workspace (managers only) */
  digestSettings: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [row] = await ctx.db<
        { id: string; digest_enabled: boolean; digest_hour: number; role: string }[]
      >`
        SELECT w.id, w.digest_enabled, w.digest_hour, wm.role
        FROM workspaces w
        JOIN workspace_members wm
          ON wm.workspace_id = w.id AND wm.user_id = ${userId}
        WHERE w.id = ${input.workspaceId}
          AND wm.role IN ('owner', 'admin', 'manager')
      `;
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      return { digestEnabled: row.digest_enabled, digestHour: row.digest_hour };
    }),

  /** Update weekly digest settings for a workspace (managers only) */
  updateDigestSettings: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        digestEnabled: z.boolean(),
        digestHour: z.number().int().min(0).max(23),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [membership] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId}
          AND user_id = ${userId}
          AND role IN ('owner', 'admin', 'manager')
      `;
      if (!membership) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db`
        UPDATE workspaces
        SET digest_enabled = ${input.digestEnabled},
            digest_hour    = ${input.digestHour}
        WHERE id = ${input.workspaceId}
      `;

      return { ok: true };
    }),
});
