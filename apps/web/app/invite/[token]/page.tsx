import { sql } from "@/lib/db/client";
import { AcceptInviteForm } from "./AcceptInviteForm";

interface PageProps {
  params: { token: string };
}

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = params;

  // Server-side: look up invite + workspace info
  const [invite] = await sql<{
    id: string;
    email: string;
    accepted_at: Date | null;
    expires_at: Date;
    workspace_name: string;
  }[]>`
    SELECT it.id, it.email, it.accepted_at, it.expires_at, w.name AS workspace_name
    FROM invite_tokens it
    JOIN workspaces w ON w.id = it.workspace_id
    WHERE it.token = ${token}
  `;

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-xl font-bold text-gray-900">Invite not found</h1>
          <p className="mt-2 text-sm text-gray-500">
            This invite link is invalid or has already been removed.
          </p>
        </div>
      </div>
    );
  }

  if (invite.accepted_at) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-xl font-bold text-gray-900">Invite already used</h1>
          <p className="mt-2 text-sm text-gray-500">
            This invite has already been accepted. Try signing in.
          </p>
        </div>
      </div>
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-xl font-bold text-gray-900">Invite expired</h1>
          <p className="mt-2 text-sm text-gray-500">
            This invite expired on{" "}
            {new Date(invite.expires_at).toLocaleDateString()}. Ask your admin to send a new one.
          </p>
        </div>
      </div>
    );
  }

  // Check if user already exists
  const [existingUser] = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE email = ${invite.email}
  `;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-bold text-gray-900">
          Join {invite.workspace_name}
        </h1>
        <p className="mt-2 mb-6 text-sm text-gray-500">
          You&apos;ve been invited to join <strong>{invite.workspace_name}</strong> on Neurify.
        </p>
        <AcceptInviteForm
          token={token}
          isNewUser={!existingUser}
          workspaceName={invite.workspace_name}
        />
      </div>
    </div>
  );
}
