import { protectedProcedure, router } from "@/lib/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";

export interface DepartmentRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MemberWithHierarchy {
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "manager" | "member";
  department: string | null;
  department_id: string | null;
  manager_id: string | null;
  joined_at: Date;
  email: string;
  display_name: string | null;
}

function requireManagerOrAbove(role: string, action: string): void {
  if (!["owner", "admin", "manager"].includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Only managers and above can ${action}`,
    });
  }
}

export const departmentsRouter = router({
  /** List all departments in a workspace */
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${userId}
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.withUserContext!<DepartmentRow[]>((tx) => tx<DepartmentRow[]>`
        SELECT * FROM departments
        WHERE workspace_id = ${input.workspaceId}
        ORDER BY name ASC
      `);
    }),

  /** Create a new department */
  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        name: z.string().min(1).max(80),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${userId}
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });
      requireManagerOrAbove(member.role, "create departments");

      const [dept] = await ctx.db<DepartmentRow[]>`
        INSERT INTO departments (workspace_id, name, description)
        VALUES (${input.workspaceId}, ${input.name}, ${input.description ?? null})
        RETURNING *
      `;

      await writeAuditEvent(ctx.db, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        eventType: "department.created",
        targetType: "department",
        targetId: dept!.id,
        payload: { name: input.name },
      });

      return dept!;
    }),

  /** Update a department */
  update: protectedProcedure
    .input(
      z.object({
        departmentId: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        description: z.string().max(500).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [dept] = await ctx.db<DepartmentRow[]>`
        SELECT * FROM departments WHERE id = ${input.departmentId}
      `;
      if (!dept) throw new TRPCError({ code: "NOT_FOUND" });

      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${dept.workspace_id} AND user_id = ${userId}
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });
      requireManagerOrAbove(member.role, "update departments");

      const name = input.name ?? dept.name;
      const description = input.description !== undefined ? input.description : dept.description;

      const [updated] = await ctx.db<DepartmentRow[]>`
        UPDATE departments
        SET name = ${name}, description = ${description}, updated_at = now()
        WHERE id = ${input.departmentId}
        RETURNING *
      `;
      return updated!;
    }),

  /** Delete a department */
  delete: protectedProcedure
    .input(z.object({ departmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [dept] = await ctx.db<DepartmentRow[]>`
        SELECT * FROM departments WHERE id = ${input.departmentId}
      `;
      if (!dept) throw new TRPCError({ code: "NOT_FOUND" });

      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${dept.workspace_id} AND user_id = ${userId}
          AND role IN ('owner', 'admin')
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db`DELETE FROM departments WHERE id = ${input.departmentId}`;
      return { ok: true };
    }),

  /** List team members with hierarchy info (manager, department) */
  teamMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [member] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${userId}
      `;
      if (!member) throw new TRPCError({ code: "FORBIDDEN" });

      return ctx.withUserContext!<MemberWithHierarchy[]>((tx) => tx<MemberWithHierarchy[]>`
        SELECT
          wm.workspace_id,
          wm.user_id,
          wm.role,
          wm.department,
          wm.department_id,
          wm.manager_id,
          wm.joined_at,
          u.email,
          u.display_name
        FROM workspace_members wm
        JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${input.workspaceId}
        ORDER BY wm.role ASC, u.display_name ASC
      `);
    }),

  /** Assign a member to a department */
  setMemberDepartment: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        departmentId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [callerMember] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${userId}
      `;
      if (!callerMember) throw new TRPCError({ code: "FORBIDDEN" });
      requireManagerOrAbove(callerMember.role, "assign departments");

      // Verify dept belongs to this workspace if set
      if (input.departmentId) {
        const [dept] = await ctx.db<{ id: string }[]>`
          SELECT id FROM departments
          WHERE id = ${input.departmentId} AND workspace_id = ${input.workspaceId}
        `;
        if (!dept) throw new TRPCError({ code: "BAD_REQUEST", message: "Department not in this workspace" });
      }

      await ctx.db`
        UPDATE workspace_members
        SET department_id = ${input.departmentId}
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.targetUserId}
      `;
      return { ok: true };
    }),

  /** Set the manager for a team member */
  setMemberManager: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        targetUserId: z.string().uuid(),
        managerId: z.string().uuid().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [callerMember] = await ctx.db<{ role: string }[]>`
        SELECT role FROM workspace_members
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${userId}
      `;
      if (!callerMember) throw new TRPCError({ code: "FORBIDDEN" });
      requireManagerOrAbove(callerMember.role, "set managers");

      // Prevent self-management
      if (input.managerId === input.targetUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A member cannot manage themselves" });
      }

      // Verify manager is in this workspace
      if (input.managerId) {
        const [mgr] = await ctx.db<{ role: string }[]>`
          SELECT role FROM workspace_members
          WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.managerId}
        `;
        if (!mgr) throw new TRPCError({ code: "BAD_REQUEST", message: "Manager not in this workspace" });
      }

      await ctx.db`
        UPDATE workspace_members
        SET manager_id = ${input.managerId}
        WHERE workspace_id = ${input.workspaceId} AND user_id = ${input.targetUserId}
      `;

      await writeAuditEvent(ctx.db, {
        workspaceId: input.workspaceId,
        actorUserId: userId,
        eventType: "member.manager_set",
        targetType: "user",
        targetId: input.targetUserId,
        payload: { managerId: input.managerId },
      });

      return { ok: true };
    }),
});
