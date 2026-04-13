import { Resend } from "resend";
import { env } from "@/lib/env";

const resend = new Resend(env.RESEND_API_KEY);

const FROM = "Neurify <no-reply@neurify.app>";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendEmail(opts: SendEmailOptions) {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
  return data!.id;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function renderWelcomeEmail(opts: {
  displayName: string;
  appUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Welcome to Neurify — let's build your first goal",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">
          Welcome, ${opts.displayName}!
        </h1>
        <p style="color:#555;line-height:1.6">
          You're all set on <strong>Neurify</strong> — the productivity platform
          that keeps you accountable with incremental goals and measurable outcomes.
        </p>
        <p style="margin-top:24px">
          <a href="${opts.appUrl}/goals/new"
             style="background:#6366f1;color:#fff;text-decoration:none;
                    padding:10px 20px;border-radius:8px;font-weight:600;
                    display:inline-block">
            Create your first goal →
          </a>
        </p>
        <p style="margin-top:32px;font-size:13px;color:#9ca3af">
          Questions? Just reply to this email.
        </p>
      </div>
    `,
  };
}

export function renderReminderEmail(opts: {
  displayName: string;
  goalTitle: string;
  goalUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `Check-in reminder: ${opts.goalTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="font-size:18px;font-weight:700">Hey ${opts.displayName},</h2>
        <p style="color:#555;line-height:1.6">
          Don't forget to log today's check-in for <strong>${opts.goalTitle}</strong>.
          Staying consistent is how goals get achieved.
        </p>
        <p style="margin-top:24px">
          <a href="${opts.goalUrl}"
             style="background:#6366f1;color:#fff;text-decoration:none;
                    padding:10px 20px;border-radius:8px;font-weight:600;
                    display:inline-block">
            Log check-in →
          </a>
        </p>
      </div>
    `,
  };
}

export function renderInviteEmail(opts: {
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `You've been invited to ${opts.workspaceName} on Neurify`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="font-size:18px;font-weight:700">You're invited!</h2>
        <p style="color:#555;line-height:1.6">
          <strong>${opts.inviterName}</strong> has invited you to join
          <strong>${opts.workspaceName}</strong> on Neurify.
        </p>
        <p style="margin-top:24px">
          <a href="${opts.acceptUrl}"
             style="background:#6366f1;color:#fff;text-decoration:none;
                    padding:10px 20px;border-radius:8px;font-weight:600;
                    display:inline-block">
            Accept invitation →
          </a>
        </p>
        <p style="margin-top:16px;font-size:13px;color:#9ca3af">
          This link expires in 7 days. If you weren't expecting this, you can ignore it.
        </p>
      </div>
    `,
  };
}

// ---------------------------------------------------------------------------
// Manager weekly digest
// ---------------------------------------------------------------------------

export interface ManagerDigestMember {
  email: string;
  displayName: string | null;
  completionPct: number;
  currentStreak: number;
  isAtRisk: boolean;
  totalGoals: number;
}

export function renderManagerDigestEmail(opts: {
  managerName: string;
  workspaceName: string;
  weekEnding: string; // e.g. "Apr 13, 2026"
  members: ManagerDigestMember[];
  dashboardUrl: string;
}): { subject: string; html: string } {
  const atRiskCount = opts.members.filter((m) => m.isAtRisk).length;
  const avgCompletion =
    opts.members.length === 0
      ? 0
      : Math.round(
          opts.members.reduce((s, m) => s + m.completionPct, 0) / opts.members.length
        );

  const memberRows = opts.members
    .map((m) => {
      const risk = m.isAtRisk
        ? `<span style="color:#ef4444;font-weight:600">⚠ At risk</span>`
        : `<span style="color:#22c55e">✓ On track</span>`;
      return `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 4px">${m.displayName ?? m.email}</td>
          <td style="padding:8px 4px;text-align:center">${m.completionPct}%</td>
          <td style="padding:8px 4px;text-align:center">${m.currentStreak}d</td>
          <td style="padding:8px 4px">${risk}</td>
        </tr>`;
    })
    .join("");

  return {
    subject: `[Neurify] Weekly team digest — ${opts.workspaceName} (week ending ${opts.weekEnding})`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
        <h2 style="font-size:20px;font-weight:700;margin-bottom:4px">
          Weekly Team Digest
        </h2>
        <p style="color:#6b7280;margin-top:0">
          ${opts.workspaceName} · week ending ${opts.weekEnding}
        </p>

        <div style="display:flex;gap:24px;margin:20px 0">
          <div style="background:#f9fafb;border-radius:8px;padding:16px;flex:1;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#6366f1">${avgCompletion}%</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px">avg completion</div>
          </div>
          <div style="background:#f9fafb;border-radius:8px;padding:16px;flex:1;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#f97316">${atRiskCount}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px">at-risk members</div>
          </div>
          <div style="background:#f9fafb;border-radius:8px;padding:16px;flex:1;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#111">${opts.members.length}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:4px">team members</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="background:#f3f4f6;text-align:left">
              <th style="padding:8px 4px">Member</th>
              <th style="padding:8px 4px;text-align:center">Completion</th>
              <th style="padding:8px 4px;text-align:center">Streak</th>
              <th style="padding:8px 4px">Status</th>
            </tr>
          </thead>
          <tbody>${memberRows}</tbody>
        </table>

        <p style="margin-top:24px">
          <a href="${opts.dashboardUrl}"
             style="background:#6366f1;color:#fff;text-decoration:none;
                    padding:10px 20px;border-radius:8px;font-weight:600;
                    display:inline-block">
            View full team dashboard →
          </a>
        </p>

        <p style="margin-top:32px;font-size:12px;color:#9ca3af">
          You're receiving this because you manage a team on Neurify.
          To stop these emails, update your notification preferences in workspace settings.
        </p>
      </div>
    `,
  };
}

/**
 * Send the weekly digest to all managers in a workspace.
 * Returns number of emails sent.
 */
export async function sendManagerDigest(
  db: import("postgres").Sql,
  workspaceId: string
): Promise<number> {
  const { env } = await import("@/lib/env");

  type ManagerRow = {
    user_id: string;
    email: string;
    display_name: string | null;
    workspace_name: string;
  };

  const managers = await db<ManagerRow[]>`
    SELECT wm.user_id, u.email, u.display_name, w.name AS workspace_name
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE wm.workspace_id = ${workspaceId}
      AND wm.role IN ('owner', 'admin', 'manager')
  `;

  if (managers.length === 0) return 0;

  type MemberStatRow = {
    user_id: string;
    email: string;
    display_name: string | null;
    total_goals: number;
    completed_goals: number;
    is_at_risk: boolean;
  };

  const memberStats = await db<MemberStatRow[]>`
    WITH mg AS (
      SELECT
        g.owner_user_id,
        COUNT(*) FILTER (WHERE g.status IN ('active','paused','achieved')) AS total_goals,
        COUNT(*) FILTER (WHERE g.status = 'achieved') AS completed_goals,
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
      WHERE g.workspace_id = ${workspaceId}
      GROUP BY g.owner_user_id
    )
    SELECT
      wm.user_id, u.email, u.display_name,
      COALESCE(mg.total_goals, 0)::int     AS total_goals,
      COALESCE(mg.completed_goals, 0)::int AS completed_goals,
      COALESCE(mg.is_at_risk, false)       AS is_at_risk
    FROM workspace_members wm
    JOIN users u ON u.id = wm.user_id
    LEFT JOIN mg ON mg.owner_user_id = wm.user_id
    WHERE wm.workspace_id = ${workspaceId}
  `;

  const weekEnding = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const members: ManagerDigestMember[] = memberStats.map((m) => ({
    email: m.email,
    displayName: m.display_name,
    completionPct:
      m.total_goals === 0
        ? 0
        : Math.round((m.completed_goals / m.total_goals) * 100),
    currentStreak: 0, // simplified for digest — full streak calc is in dashboard query
    isAtRisk: m.is_at_risk,
    totalGoals: m.total_goals,
  }));

  // Get workspace slug for the dashboard URL
  const [ws] = await db<{ slug: string }[]>`
    SELECT slug FROM workspaces WHERE id = ${workspaceId}
  `;
  const dashboardUrl = `${env.NEXT_PUBLIC_APP_URL}/w/${ws?.slug ?? workspaceId}/team`;

  let sent = 0;
  for (const manager of managers) {
    const tmpl = renderManagerDigestEmail({
      managerName: manager.display_name ?? manager.email,
      workspaceName: manager.workspace_name,
      weekEnding,
      members,
      dashboardUrl,
    });
    try {
      await sendEmail({ to: manager.email, ...tmpl });
      sent++;
    } catch {
      // Log and continue — don't let one failure block others
      console.error(`Failed to send digest to ${manager.email}`);
    }
  }

  return sent;
}
