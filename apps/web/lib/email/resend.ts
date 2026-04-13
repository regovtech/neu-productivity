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

// Stub for future weekly summary
export function renderWeeklySummaryEmail(_opts: {
  displayName: string;
  appUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "Your weekly Neurify summary",
    html: "<p>Weekly summary coming soon.</p>",
  };
}
