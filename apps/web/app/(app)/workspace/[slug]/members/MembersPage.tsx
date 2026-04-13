"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  slug: string;
  workspaceId: string;
}

const ROLES = ["member", "manager", "admin", "owner"] as const;
type Role = (typeof ROLES)[number];

export function MembersPage({ slug, workspaceId }: Props) {
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const { data: members, isLoading: membersLoading } = trpc.workspaces.members.useQuery({ slug });
  const { data: pendingInvites } = trpc.invites.list.useQuery({ workspaceId });

  const invite = trpc.invites.create.useMutation({
    onSuccess: () => {
      setEmail("");
      setInviteError(null);
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
      utils.invites.list.invalidate({ workspaceId });
    },
    onError: (err) => setInviteError(err.message),
  });

  const revokeInvite = trpc.invites.revoke.useMutation({
    onSuccess: () => utils.invites.list.invalidate({ workspaceId }),
  });

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(false);
    if (!email.trim()) { setInviteError("Email is required"); return; }
    invite.mutate({ workspaceId, email: email.trim(), role });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Members</h1>
        <p className="mt-1 text-sm text-gray-500">Manage who has access to this workspace.</p>
      </div>

      {/* Invite form */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="mb-4 font-semibold text-gray-900">Invite by email</h2>
        <form onSubmit={handleInvite} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={invite.isPending}>
            Send invite
          </Button>
        </form>
        {inviteError && (
          <p className="mt-2 text-sm text-red-600">{inviteError}</p>
        )}
        {inviteSuccess && (
          <p className="mt-2 text-sm text-green-600">Invite sent!</p>
        )}
      </section>

      {/* Current members */}
      <section>
        <h2 className="mb-3 font-semibold text-gray-900">Current members</h2>
        {membersLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {!membersLoading && members && members.length > 0 && (
          <div className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200 bg-white overflow-hidden">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {m.display_name ?? m.email}
                  </p>
                  {m.display_name && (
                    <p className="text-xs text-gray-400">{m.email}</p>
                  )}
                </div>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 capitalize">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pending invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-gray-900">Pending invites</h2>
          <div className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200 bg-white overflow-hidden">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.email}</p>
                  <p className="text-xs text-gray-400">
                    Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => revokeInvite.mutate({ inviteId: inv.id })}
                  className="text-xs text-red-500 hover:underline"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
