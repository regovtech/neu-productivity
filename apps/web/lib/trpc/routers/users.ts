import { protectedProcedure, publicProcedure, router } from "@/lib/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@/lib/auth/password";
import { writeAuditEvent, AuditEvent } from "@/lib/audit";

export const usersRouter = router({
  /** Return current user profile */
  me: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    type UserRow = {
      id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
      created_at: Date;
      onboarding_completed_at: Date | null;
    };
    const [user] = await ctx.db<UserRow[]>`
      SELECT id, email, display_name, avatar_url, created_at, onboarding_completed_at
      FROM users
      WHERE id = ${userId} AND deleted_at IS NULL
    `;
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return user;
  }),

  /** Mark onboarding as complete and optionally set display name */
  completeOnboarding: protectedProcedure
    .input(
      z.object({
        displayName: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      await ctx.db`
        UPDATE users
        SET
          onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
          display_name = CASE
            WHEN ${input.displayName ?? null} IS NOT NULL THEN ${input.displayName ?? null}
            ELSE display_name
          END,
          updated_at = now()
        WHERE id = ${userId}
      `;
      return { ok: true };
    }),

  /** Register with email + password */
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
        displayName: z.string().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.password);
      try {
        const [user] = await ctx.db<{ id: string; email: string }[]>`
          INSERT INTO users (id, email, display_name, password_hash)
          VALUES (gen_random_uuid(), ${input.email}, ${input.displayName ?? null}, ${passwordHash})
          RETURNING id, email
        `;
        // Auto-create personal workspace
        const slug = `personal-${user.id}`;
        await ctx.db`
          WITH ws AS (
            INSERT INTO workspaces (id, slug, name, kind, plan)
            VALUES (gen_random_uuid(), ${slug}, 'Personal', 'personal', 'free')
            RETURNING id
          )
          INSERT INTO workspace_members (workspace_id, user_id, role)
          SELECT id, ${user.id}, 'owner' FROM ws
        `;
        return { userId: user.id, email: user.email };
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes("unique")
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists.",
          });
        }
        throw err;
      }
    }),

  // -------------------------------------------------------------------------
  // GDPR: Account deletion pipeline
  // -------------------------------------------------------------------------

  /**
   * Request account deletion.
   * Sets deleted_at (soft delete — account is immediately hidden) and queues
   * a hard-delete job to fire 30 days later.
   */
  requestDeletion: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      // Soft-delete the user immediately
      await ctx.db`
        UPDATE users SET deleted_at = now() WHERE id = ${userId}
      `;

      // Queue hard-delete in 30 days
      await ctx.db`
        INSERT INTO user_deletion_queue (user_id, requested_at, execute_after)
        VALUES (${userId}, now(), now() + INTERVAL '30 days')
        ON CONFLICT (user_id) DO UPDATE
          SET requested_at = EXCLUDED.requested_at,
              execute_after = EXCLUDED.execute_after,
              executed_at = NULL
      `;

      // Audit in every workspace the user belongs to
      const workspaces = await ctx.db<{ workspace_id: string }[]>`
        SELECT workspace_id FROM workspace_members WHERE user_id = ${userId}
      `;
      for (const ws of workspaces) {
        await writeAuditEvent(ctx.db, {
          workspaceId: ws.workspace_id,
          actorUserId: userId,
          eventType: AuditEvent.ACCOUNT_DELETION_REQUESTED,
          targetType: "user",
          targetId: userId,
        });
      }

      return { scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
    }),

  /**
   * Cancel a pending deletion request (within the 30-day window).
   * Re-activates the account.
   */
  cancelDeletion: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      // Verify there's a pending (not yet executed) deletion request
      const [pending] = await ctx.db<{ id: string }[]>`
        SELECT id FROM user_deletion_queue
        WHERE user_id = ${userId} AND executed_at IS NULL
      `;
      if (!pending) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No pending deletion request found",
        });
      }

      // Restore the account
      await ctx.db`UPDATE users SET deleted_at = NULL WHERE id = ${userId}`;
      await ctx.db`DELETE FROM user_deletion_queue WHERE user_id = ${userId} AND executed_at IS NULL`;

      return { ok: true };
    }),
});
