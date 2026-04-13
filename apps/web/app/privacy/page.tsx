import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Neu",
  description: "How Neu collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  const companyName = "Neu Productivity Platform";
  const contactEmail = "privacy@neu.app";
  const effectiveDate = "April 14, 2026";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <Link
        href="/"
        className="mb-8 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to Neu
      </Link>

      <h1 className="mb-2 text-3xl font-bold text-gray-900">Privacy Policy</h1>
      <p className="mb-8 text-sm text-gray-500">Effective: {effectiveDate}</p>

      <div className="prose prose-gray max-w-none space-y-8 text-gray-700">
        <section>
          <h2 className="text-xl font-semibold text-gray-900">1. Who we are</h2>
          <p>
            {companyName} (&ldquo;Neu&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;) operates the Neu
            productivity platform, accessible at neu.app. This policy explains how we collect, use,
            and protect your personal data when you use our service.
          </p>
          <p>
            Questions? Contact us at{" "}
            <a href={`mailto:${contactEmail}`} className="text-brand-600 hover:underline">
              {contactEmail}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">2. Data we collect</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Account data:</strong> email address, display name, avatar URL (for OAuth
              accounts), and encrypted password hash (for email/password accounts).
            </li>
            <li>
              <strong>Productivity data:</strong> goals you create, check-in entries, streak
              history, and progress metrics.
            </li>
            <li>
              <strong>Workspace data:</strong> workspace name, slug, membership roles, and
              department assignments (for B2B workspaces).
            </li>
            <li>
              <strong>Usage logs:</strong> audit events recording key actions (goal creation,
              check-ins, member invitations) within your workspace.
            </li>
            <li>
              <strong>Session data:</strong> authentication tokens stored as secure cookies.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> sell your data to third parties or use it for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">3. How we use your data</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>To provide and improve the Neu service.</li>
            <li>To send transactional emails (check-in reminders, invite notifications).</li>
            <li>To monitor platform health and detect errors (via Sentry — see section 6).</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">4. Data retention</h2>
          <p>
            Your account data is retained for as long as your account is active. When you request
            account deletion, your account is immediately soft-deleted (hidden) and permanently
            erased after 30 days. You may cancel a deletion request within that window.
          </p>
          <p>
            Audit log entries associated with your account are anonymised (actor set to null) on
            hard-delete rather than deleted, to preserve the integrity of workspace history for
            other members.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">5. Your rights (GDPR)</h2>
          <p>If you are located in the EEA or UK, you have the right to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Access the personal data we hold about you.</li>
            <li>Correct inaccurate data.</li>
            <li>Request deletion of your account and associated data.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Data portability (export your goals and check-in history on request).</li>
          </ul>
          <p>
            To exercise these rights, visit{" "}
            <Link href="/settings/account" className="text-brand-600 hover:underline">
              Account Settings → Delete account
            </Link>{" "}
            or contact{" "}
            <a href={`mailto:${contactEmail}`} className="text-brand-600 hover:underline">
              {contactEmail}
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">6. Sub-processors</h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Railway</strong> — PostgreSQL database hosting (EU/US regions).
            </li>
            <li>
              <strong>Vercel</strong> — Next.js hosting and edge network.
            </li>
            <li>
              <strong>Resend</strong> — Transactional email delivery.
            </li>
            <li>
              <strong>Sentry</strong> — Error monitoring. Only anonymised error traces are sent;
              no email addresses or names are captured.
            </li>
            <li>
              <strong>Google OAuth</strong> — Optional sign-in provider. See{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline"
              >
                Google&apos;s Privacy Policy
              </a>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">7. Cookies</h2>
          <p>
            We use strictly necessary cookies only: a session cookie for authentication
            (HttpOnly, Secure, SameSite=Lax). We do not use tracking or analytics cookies.
          </p>
          <p>
            You can withdraw consent at any time by clearing cookies in your browser; this will
            sign you out of your session.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900">8. Changes to this policy</h2>
          <p>
            We will notify users of material changes by email or by posting a notice in the
            application. Continued use after the effective date of changes constitutes acceptance.
          </p>
        </section>
      </div>
    </div>
  );
}
