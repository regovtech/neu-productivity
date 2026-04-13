import type { Sql } from "postgres";

export interface AuditEventInput {
  workspaceId: string;
  actorUserId: string | null;
  eventType: string;
  targetType?: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Write a single audit event. Fire-and-forget safe — call without awaiting
 * if you don't want to block the primary mutation, but prefer awaiting so
 * failures surface in tests.
 */
export async function writeAuditEvent(
  db: Sql,
  event: AuditEventInput
): Promise<void> {
  await db`
    INSERT INTO audit_events
      (workspace_id, actor_user_id, event_type, target_type, target_id, payload)
    VALUES (
      ${event.workspaceId},
      ${event.actorUserId ?? null},
      ${event.eventType},
      ${event.targetType ?? null},
      ${event.targetId ?? null},
      ${event.payload ? JSON.stringify(event.payload) : null}
    )
  `;
}

// -----------------------------------------------------------------------
// Canonical event types (keep in sync with audit_events.event_type usage)
// -----------------------------------------------------------------------
export const AuditEvent = {
  // Goals
  GOAL_CREATED:        "goal.created",
  GOAL_ASSIGNED:       "goal.assigned",
  GOAL_STATUS_CHANGED: "goal.status_changed",
  GOAL_CHECKED_IN:     "goal.checked_in",
  // Members
  MEMBER_INVITED:      "member.invited",
  MEMBER_JOINED:       "member.joined",
  MEMBER_ROLE_CHANGED: "member.role_changed",
  MEMBER_MANAGER_SET:  "member.manager_set",
  // Departments
  DEPT_CREATED:        "department.created",
  // Templates
  TEMPLATE_CREATED:    "template.created",
  TEMPLATE_ASSIGNED:   "template.assigned",
  // Account
  ACCOUNT_DELETION_REQUESTED: "account.deletion_requested",
} as const;
