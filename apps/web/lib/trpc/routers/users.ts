import { protectedProcedure, publicProcedure, router } from "@/lib/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@/lib/auth/password";

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
});
