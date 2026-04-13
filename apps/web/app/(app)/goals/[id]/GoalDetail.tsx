"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { ProgressRing } from "@/components/goals/ProgressRing";
import { StreakBadge } from "@/components/goals/StreakBadge";
import { GoalStatusActions } from "@/components/goals/GoalStatusActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORY_LABELS: Record<string, string> = {
  health: "Health",
  work: "Work",
  learning: "Learning",
  finance: "Finance",
  other: "Other",
};

export function GoalDetail({ goalId }: { goalId: string }) {
  const utils = trpc.useUtils();

  const { data: goal, isLoading: goalLoading } = trpc.goals.get.useQuery({ id: goalId });
  const { data: stats, isLoading: statsLoading } = trpc.checkIns.stats.useQuery({ goalId });
  const { data: checkIns, isLoading: checkInsLoading } = trpc.checkIns.list.useQuery({
    goalId,
    limit: 20,
  });

  const [checkInValue, setCheckInValue] = useState("");
  const [checkInNote, setCheckInNote] = useState("");
  const [checkInError, setCheckInError] = useState<string | null>(null);

  const createCheckIn = trpc.checkIns.create.useMutation({
    onSuccess: () => {
      setCheckInValue("");
      setCheckInNote("");
      setCheckInError(null);
      // Invalidate stats + check-ins list for fresh data
      utils.checkIns.stats.invalidate({ goalId });
      utils.checkIns.list.invalidate({ goalId });
    },
    onError: (err) => {
      setCheckInError(err.message);
    },
  });

  function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setCheckInError(null);
    const val = parseFloat(checkInValue);
    if (isNaN(val) || val <= 0) {
      setCheckInError("Enter a positive number");
      return;
    }
    createCheckIn.mutate({
      goalId,
      value: val,
      note: checkInNote.trim() || undefined,
    });
  }

  if (goalLoading) {
    return <div className="py-20 text-center text-sm text-gray-400">Loading…</div>;
  }

  if (!goal) {
    return (
      <div className="py-20 text-center">
        <p className="text-gray-500">Goal not found.</p>
        <Link href="/goals" className="mt-2 inline-block text-sm text-brand-600 hover:underline">
          Back to goals
        </Link>
      </div>
    );
  }

  const isActive = goal.status === "active";
  const progressPct = stats?.progressPct ?? 0;
  const streak = stats?.streak ?? 0;
  const projected = stats?.projectedCompletion
    ? new Date(stats.projectedCompletion).toLocaleDateString()
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {CATEGORY_LABELS[goal.category] ?? goal.category}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{goal.title}</h1>
          {goal.description && (
            <p className="mt-1 text-sm text-gray-500">{goal.description}</p>
          )}
          <p className="mt-2 text-sm text-gray-400">
            Target: <strong>{goal.numeric_target} {goal.unit}</strong> by{" "}
            {new Date(goal.target_date).toLocaleDateString()} · {goal.cadence}
          </p>
        </div>
        {!statsLoading && (
          <ProgressRing pct={progressPct} size={72} strokeWidth={6} />
        )}
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-4">
        <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-200 flex flex-col gap-0.5">
          <p className="text-xs text-gray-400">Progress</p>
          <p className="text-lg font-bold text-gray-900">{Math.round(progressPct)}%</p>
        </div>
        <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-200 flex flex-col gap-0.5">
          <p className="text-xs text-gray-400">Streak</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-gray-900">{streak}</p>
            <StreakBadge streak={streak} />
          </div>
        </div>
        {stats?.latestValue != null && (
          <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-200 flex flex-col gap-0.5">
            <p className="text-xs text-gray-400">Latest value</p>
            <p className="text-lg font-bold text-gray-900">
              {stats.latestValue} {goal.unit}
            </p>
          </div>
        )}
        {projected && (
          <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-200 flex flex-col gap-0.5">
            <p className="text-xs text-gray-400">Projected completion</p>
            <p className="text-lg font-bold text-gray-900">{projected}</p>
          </div>
        )}
      </div>

      {/* Check-in widget */}
      {isActive && (
        <section className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
          <h2 className="mb-4 font-semibold text-gray-900">Log a check-in</h2>
          <form onSubmit={handleCheckIn} noValidate className="flex flex-col gap-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label={`Value (${goal.unit})`}
                  type="number"
                  step="any"
                  min={0}
                  value={checkInValue}
                  onChange={(e) => setCheckInValue(e.target.value)}
                  placeholder={`Enter ${goal.unit}`}
                  error={checkInError ?? undefined}
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Note (optional)"
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                  placeholder="How did it go?"
                />
              </div>
            </div>
            <Button type="submit" className="w-auto self-start px-6" loading={createCheckIn.isPending}>
              Log check-in
            </Button>
            {createCheckIn.isSuccess && (
              <p className="text-sm text-green-700">Check-in logged!</p>
            )}
          </form>
        </section>
      )}

      {/* Lifecycle actions */}
      <section className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
        <h2 className="mb-3 font-semibold text-gray-900">Goal actions</h2>
        <GoalStatusActions goalId={goalId} currentStatus={goal.status} />
      </section>

      {/* Check-in history */}
      <section>
        <h2 className="mb-3 font-semibold text-gray-900">Check-in history</h2>
        {checkInsLoading && (
          <p className="text-sm text-gray-400">Loading history…</p>
        )}
        {!checkInsLoading && (!checkIns || checkIns.length === 0) && (
          <p className="text-sm text-gray-400">No check-ins yet. Log your first one above!</p>
        )}
        {checkIns && checkIns.length > 0 && (
          <div className="space-y-2">
            {checkIns.map((ci) => (
              <div
                key={ci.id}
                className="flex items-center justify-between rounded-lg bg-white px-4 py-3 ring-1 ring-gray-100"
              >
                <div>
                  <span className="font-medium text-gray-900">
                    {ci.value} {goal.unit}
                  </span>
                  {ci.note && (
                    <span className="ml-2 text-sm text-gray-400">&mdash; {ci.note}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(ci.checked_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
