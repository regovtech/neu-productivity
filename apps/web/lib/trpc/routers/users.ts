import { protectedProcedure, publicProcedure, router } from "@/lib/trpc/init";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hashPassword } from "@/lib/auth/password";

export const usersRouter = router({
  /** Return current user profile */
  me: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    type UserRow = { id: string; email: string; display_name: string | null; avatar_url: string | null; created_at: Date };
    const [user] = await ctx.db<UserRow[]>`
      SELECT id, email, display_name, avatar_url, created_at
      FROM users
      WHERE id = ${userId} AND deleted_at IS NULL
    `;
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return user;
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
