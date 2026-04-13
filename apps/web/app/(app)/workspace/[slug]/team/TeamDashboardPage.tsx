"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import Link from "next/link";

interface Props {
  workspaceId: string;
  slug: string;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-gray-600">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export function TeamDashboardPage({ workspaceId, slug }: Props) {
  const [drilldownUserId, setDrilldownUserId] = useState<string | null>(null);

  const { data: members, isLoading } = trpc.manager.teamDashboard.useQuery(
    { workspaceId },
    { refetchOnWindowFocus: false }
  );

  const { data: drilldown, isLoading: drilldownLoading } =
    trpc.manager.memberDrilldown.useQuery(
      { workspaceId, targetUserId: drilldownUserId! },
      { enabled: !!drilldownUserId }
    );

  const sendDigest = trpc.manager.sendDigest.useMutation();

  const atRiskCount = members?.filter((m) => m.is_at_risk).length ?? 0;
  const avgCompletion =
    members && members.length > 0
      ? Math.round(
          members.reduce((s, m) => s + Number(m.completion_pct), 0) / members.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Team Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Goal completion, streaks, and at-risk flags for your team.
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={`/api/workspace/${slug}/export/metrics`}
            download
            className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </a>
          <button
            onClick={() => sendDigest.mutate({ workspaceId })}
            disabled={sendDigest.isPending}
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {sendDigest.isPending ? "Sending…" : "Send Digest Email"}
          </button>
        </div>
      </div>

      {sendDigest.isSuccess && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          Digest sent to {sendDigest.data.sent} manager(s).
        </div>
      )}

      {/* Summary stats */}
      {!isLoading && members && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Team members" value={members.length} />
          <StatCard label="Avg completion" value={`${avgCompletion}%`} />
          <StatCard
            label="At-risk members"
            value={atRiskCount}
            sub="No check-in in current period"
          />
        </div>
      )}

      {/* Member table */}
      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Department</th>
              <th className="px-4 py-3 text-center">Completion</th>
              <th className="px-4 py-3 text-center">Streak</th>
              <th className="px-4 py-3 text-center">Goals</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-gray-100" />
                    </td>
                  ))}
                </tr>
              ))}
            {members?.map((m) => (
              <tr
                key={m.user_id}
                className={m.is_at_risk ? "bg-red-50/40" : undefined}
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {m.display_name ?? m.email}
                  <div className="text-xs text-gray-400">{m.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {m.department_name ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="inline-flex flex-col items-center gap-1">
                    <span className="font-semibold text-gray-900">
                      {m.completion_pct}%
                    </span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.min(100, m.completion_pct)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-gray-700">
                  {m.current_streak > 0 ? (
                    <span className="font-medium">🔥 {m.current_streak}d</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-gray-600">
                  {m.completed_goals}/{m.total_goals}
                </td>
                <td className="px-4 py-3">
                  {m.is_at_risk ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      ⚠ At risk
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ On track
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() =>
                      setDrilldownUserId(
                        drilldownUserId === m.user_id ? null : m.user_id
                      )
                    }
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {drilldownUserId === m.user_id ? "Hide" : "Details"}
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && (!members || members.length === 0) && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-gray-400"
                >
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Drilldown panel */}
      {drilldownUserId && (
        <div className="rounded-xl bg-white p-5 ring-1 ring-brand-200">
          {drilldownLoading && (
            <p className="text-sm text-gray-400">Loading…</p>
          )}
          {drilldown && (
            <>
              <h2 className="mb-4 font-semibold text-gray-900">
                {drilldown.member.display_name ?? drilldown.member.email} — Goals
              </h2>
              <div className="space-y-3">
                {drilldown.goals.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-start justify-between rounded-lg bg-gray-50 px-4 py-3"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{g.title}</div>
                      <div className="text-xs text-gray-400">
                        {g.cadence} · target {g.numeric_target} {g.unit} by{" "}
                        {g.target_date}
                        {g.is_mandatory && (
                          <span className="ml-2 rounded bg-orange-100 px-1 text-orange-700">
                            mandatory
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <span
                        className={`font-medium ${
                          g.status === "achieved"
                            ? "text-green-600"
                            : g.status === "active"
                            ? "text-brand-600"
                            : "text-gray-400"
                        }`}
                      >
                        {g.status}
                      </span>
                      {g.last_checkin_value !== null && (
                        <div className="text-xs text-gray-400">
                          Last: {g.last_checkin_value} {g.unit}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {drilldown.goals.length === 0 && (
                  <p className="text-sm text-gray-400">No goals assigned.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Links */}
      <div className="flex gap-4 text-sm">
        <Link
          href={`/workspace/${slug}/assign`}
          className="text-brand-600 hover:underline"
        >
          Assign goals to team →
        </Link>
        <Link
          href={`/workspace/${slug}/departments`}
          className="text-brand-600 hover:underline"
        >
          Manage departments →
        </Link>
      </div>
    </div>
  );
}
