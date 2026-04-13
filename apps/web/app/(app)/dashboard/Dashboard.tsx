"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ProgressRing } from "@/components/goals/ProgressRing";
import { StreakBadge } from "@/components/goals/StreakBadge";

const CATEGORY_LABELS: Record<string, string> = {
  health: "Health",
  work: "Work",
  learning: "Learning",
  finance: "Finance",
  other: "Other",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function Dashboard({ displayName }: { displayName: string | null }) {
  const { data: goals, isLoading } = trpc.goals.list.useQuery({ status: "active" });

  const goalIds = goals?.map((g) => g.id) ?? [];
  const { data: latestCheckIns } = trpc.checkIns.latestByGoals.useQuery(
    { goalIds },
    { enabled: goalIds.length > 0 }
  );

  const today = todayIso();

  const needsCheckInToday = goals?.filter((g) => {
    if (g.cadence !== "daily") return false;
    const latest = latestCheckIns?.find((ci) => ci.goal_id === g.id);
    if (!latest) return true;
    return new Date(latest.checked_at).toISOString().slice(0, 10) !== today;
  });

  const greeting = getGreeting();

  if (isLoading) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-10">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {displayName ?? "there"} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Needs check-in today */}
      {needsCheckInToday && needsCheckInToday.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold text-amber-700">
            Needs check-in today ({needsCheckInToday.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {needsCheckInToday.map((goal) => (
              <Link
                key={goal.id}
                href={`/goals/${goal.id}`}
                className="flex items-center gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-3 hover:border-amber-400 transition"
              >
                <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="truncate font-medium text-amber-900">{goal.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Active goals grid */}
      {goals && goals.length > 0 ? (
        <section>
          <h2 className="mb-3 font-semibold text-gray-700">Active goals</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((goal) => {
              const latest = latestCheckIns?.find((ci) => ci.goal_id === goal.id);
              return (
                <GoalDashCard key={goal.id} goal={goal} lastCheckIn={latest ?? null} />
              );
            })}
          </div>
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-300 py-20 text-center">
          <p className="text-gray-500">No active goals. Create one to get started!</p>
          <Link
            href="/goals/new"
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Create a goal
          </Link>
        </div>
      )}
    </div>
  );
}

function GoalDashCard({
  goal,
  lastCheckIn,
}: {
  goal: { id: string; title: string; category: string; numeric_target: number; unit: string };
  lastCheckIn: { checked_at: Date; value: number } | null;
}) {
  const { data: stats } = trpc.checkIns.stats.useQuery({ goalId: goal.id });

  return (
    <Link
      href={`/goals/${goal.id}`}
      className="group flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 hover:ring-brand-400 hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="truncate font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
            {goal.title}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">
            {CATEGORY_LABELS[goal.category] ?? goal.category}
          </p>
        </div>
        {stats && <ProgressRing pct={stats.progressPct} size={48} strokeWidth={4} />}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        {stats && <StreakBadge streak={stats.streak} />}
        {lastCheckIn ? (
          <span>Last: {new Date(lastCheckIn.checked_at).toLocaleDateString()}</span>
        ) : (
          <span className="text-amber-600">No check-ins yet</span>
        )}
      </div>
    </Link>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
