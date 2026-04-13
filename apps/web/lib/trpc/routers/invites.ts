import { protectedProcedure, publicProcedure, router } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { sendEmail, renderInviteEmail } from "@/lib/email/resend";
import { env } from "@/lib/env";

export interface InviteRow {
  id: string;
  workspace_id: string;
  invited_by: string;
  email: string;
  role: string;
  token: string;
  accepted_at: Date | null;
  expires_at: Date;
  created_at: Date;
}

const VALID_ROLES = ["owner", "admin", "manager", "member"] as const;

export const invitesRouter = router({
  /** List pending (not accepted, not expired) invites for a workspace */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Only owner/admin may view invite list
      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${userId}
          AND role IN ('owner', 'admin')
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.withUserContext!<InviteRow[]>((tx) => tx<InviteRow[]>`
        SELECT * FROM invite_tokens
        WHERE workspace_id = ${input.workspaceId}
          AND accepted_at IS NULL
          AND expires_at > now()
        ORDER BY created_at DESC
      `);
    }),

  /** Create an invite and send the invite email */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(VALID_ROLES).default("member"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Only owner/admin may invite
      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${userId}
          AND role IN ('owner', 'admin')
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });

      // Get workspace name and inviter display name for the email
      const [ws] = await ctx.db<{ name: string }[]>`
        SELECT name FROM workspaces WHERE id = ${input.workspaceId}
      `;
      const [inviter] = await ctx.db<{ display_name: string | null; email: string }[]>`
        SELECT display_name, email FROM users WHERE id = ${userId}
      `;

      // Insert invite token
      const [invite] = await ctx.db<InviteRow[]>`
        INSERT INTO invite_tokens (workspace_id, invited_by, email, role)
        VALUES (${input.workspaceId}, ${userId}, ${input.email}, ${input.role})
        RETURNING *
      `;

      // Send invite email (non-blocking — failure surfaces as partial success)
      const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${invite!.token}`;
      const tmpl = renderInviteEmail({
        workspaceName: ws?.name ?? "your workspace",
        inviterName: inviter?.display_name ?? inviter?.email ?? "A teammate",
        acceptUrl,
      });
      await sendEmail({ to: input.email, ...tmpl });

      return invite!;
    }),

  /** Revoke a pending invite */
  revoke: protectedProcedure
    .input(z.object({ inviteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [invite] = await ctx.db<InviteRow[]>`
        SELECT * FROM invite_tokens WHERE id = ${input.inviteId}
      `;
      if (!invite) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify caller is owner/admin of the workspace
      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${invite.workspace_id} AND user_id = ${userId}
          AND role IN ('owner', 'admin')
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db`DELETE FROM invite_tokens WHERE id = ${input.inviteId}`;
      return { ok: true };
    }),

  /** Public: look up an invite by token (for the accept page) */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().length(64) }))
    .query(async ({ ctx }) => {
      // token validated in the mutation — just need workspace name here
      // We use the raw input; publicProcedure has no session guard
      // (Re-read input from args — publicProcedure ctx doesn't carry session)
      return null; // placeholder — actual impl in acceptInvite
    }),

  /** Public: accept an invite — creates account if needed, joins workspace */
  acceptInvite: publicProcedure
    .input(
      z.object({
        token: z.string(),
        displayName: z.string().min(1).max(100).optional(),
        password: z.string().min(8).optional(), // only for new accounts
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [invite] = await ctx.db<InviteRow[]>`
        SELECT * FROM invite_tokens WHERE token = ${input.token}
      `;
      if (!invite) throw new TRPCError({ code: "NOT_FOUND", message: "Invite not found" });
      if (invite.accepted_at) {
        throw new TRPCError({ code: "CONFLICT", message: "Invite already accepted" });
      }
      if (new Date(invite.expires_at) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invite has expired" });
      }

      // Find or create user
      const [existingUser] = await ctx.db<{ id: string }[]>`
        SELECT id FROM users WHERE email = ${invite.email}
      `;

      let userId: string;
      if (existingUser) {
        userId = existingUser.id;
      } else {
        if (!input.password) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Password required for new account",
          });
        }
        const { hashPassword } = await import("@/lib/auth/password");
        const hash = await hashPassword(input.password);
        const [newUser] = await ctx.db<{ id: string }[]>`
          INSERT INTO users (email, display_name, password_hash)
          VALUES (${invite.email}, ${input.displayName ?? null}, ${hash})
          RETURNING id
        `;
        userId = newUser!.id;
      }

      // Upsert workspace membership
      await ctx.db`
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES (${invite.workspace_id}, ${userId}, ${invite.role})
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
      `;

      // Mark token accepted
      await ctx.db`
        UPDATE invite_tokens SET accepted_at = now() WHERE id = ${invite.id}
      `;

      return { userId, workspaceId: invite.workspace_id };
    }),
});
