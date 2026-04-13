"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ProgressRing } from "@/components/goals/ProgressRing";
import { StreakBadge } from "@/components/goals/StreakBadge";
import { Button } from "@/components/ui/button";

const CATEGORY_LABELS: Record<string, string> = {
  health: "Health",
  work: "Work",
  learning: "Learning",
  finance: "Finance",
  other: "Other",
};

export function GoalsList() {
  const { data: goals, isLoading, error } = trpc.goals.list.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
        Loading goals…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
        Failed to load goals: {error.message}
      </div>
    );
  }

  const active = goals?.filter((g) => g.status === "active") ?? [];
  const paused = goals?.filter((g) => g.status === "paused") ?? [];

  const isFreemiumLocked = active.length + paused.length >= 3;

  if (!goals || goals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-300 py-20 text-center">
        <p className="text-gray-500">No goals yet. Set your first goal to get started.</p>
        <Link href="/goals/new">
          <Button className="w-auto px-6">Create your first goal</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Active goals */}
      {active.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Active ({active.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((goal) => (
              <GoalCard key={goal.id} goalId={goal.id} title={goal.title} category={goal.category} status="active" />
            ))}
          </div>
        </section>
      )}

      {/* Paused goals */}
      {paused.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Paused ({paused.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paused.map((goal) => (
              <GoalCard key={goal.id} goalId={goal.id} title={goal.title} category={goal.category} status="paused" />
            ))}
          </div>
        </section>
      )}

      {/* Freemium gate */}
      {isFreemiumLocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-5">
          <p className="font-semibold text-amber-800">Free plan limit reached</p>
          <p className="mt-1 text-sm text-amber-700">
            You&apos;ve used all 3 goal slots on the free plan. Upgrade to create unlimited goals.
          </p>
          <button className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
            Upgrade to Pro
          </button>
        </div>
      )}
    </div>
  );
}

function GoalCard({
  goalId,
  title,
  category,
  status,
}: {
  goalId: string;
  title: string;
  category: string;
  status: string;
}) {
  const { data: stats } = trpc.checkIns.stats.useQuery({ goalId });

  return (
    <Link
      href={`/goals/${goalId}`}
      className="group flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:ring-brand-400 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="truncate font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
            {title}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{CATEGORY_LABELS[category] ?? category}</p>
        </div>
        {stats && <ProgressRing pct={stats.progressPct} size={48} strokeWidth={4} />}
      </div>
      <div className="flex items-center gap-2">
        {stats && <StreakBadge streak={stats.streak} />}
        {status === "paused" && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            Paused
          </span>
        )}
      </div>
    </Link>
  );
}
