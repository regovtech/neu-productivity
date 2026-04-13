"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GoalCategory, GoalCadence } from "@/lib/trpc/routers/goals";
import { clsx } from "clsx";

const CATEGORIES: { value: GoalCategory; label: string; emoji: string }[] = [
  { value: "health", label: "Health", emoji: "💪" },
  { value: "work", label: "Work", emoji: "💼" },
  { value: "learning", label: "Learning", emoji: "📚" },
  { value: "finance", label: "Finance", emoji: "💰" },
  { value: "other", label: "Other", emoji: "⭐" },
];

type Step = "welcome" | "first-goal" | "done";

export function OnboardingWizard({ currentDisplayName }: { currentDisplayName: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");

  // Welcome step
  const [displayName, setDisplayName] = useState(currentDisplayName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);

  // First goal step
  const [category, setCategory] = useState<GoalCategory | "">("");
  const [title, setTitle] = useState("");
  const [numericTarget, setNumericTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [cadence, setCadence] = useState<GoalCadence | "">("");
  const [targetDate, setTargetDate] = useState("");
  const [goalErrors, setGoalErrors] = useState<Record<string, string>>({});

  const completeOnboarding = trpc.users.completeOnboarding.useMutation();
  const createGoal = trpc.goals.create.useMutation();

  async function handleWelcome() {
    const name = displayName.trim();
    if (!name) {
      setNameError("Please enter your name");
      return;
    }
    setNameError(null);
    setStep("first-goal");
  }

  async function handleSkipGoal() {
    await completeOnboarding.mutateAsync({ displayName: displayName.trim() || undefined });
    router.push("/dashboard");
  }

  async function handleCreateGoal() {
    const errs: Record<string, string> = {};
    if (!category) errs.category = "Pick a category";
    if (!title.trim()) errs.title = "Title is required";
    const n = parseFloat(numericTarget);
    if (!numericTarget || isNaN(n) || n <= 0) errs.numericTarget = "Enter a positive number";
    if (!unit.trim()) errs.unit = "Required";
    if (!cadence) errs.cadence = "Select a cadence";
    if (!targetDate) errs.targetDate = "Required";
    else if (new Date(targetDate) <= new Date()) errs.targetDate = "Must be in the future";
    setGoalErrors(errs);
    if (Object.keys(errs).length > 0) return;

    await completeOnboarding.mutateAsync({ displayName: displayName.trim() || undefined });
    const goal = await createGoal.mutateAsync({
      category: category as GoalCategory,
      title: title.trim(),
      numericTarget: n,
      unit: unit.trim(),
      cadence: cadence as GoalCadence,
      targetDate,
    });
    router.push(`/goals/${goal.id}`);
  }

  if (step === "welcome") {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-4xl mb-4">👋</p>
          <h1 className="text-2xl font-bold text-gray-900">Welcome to Neu!</h1>
          <p className="mt-2 text-gray-500">
            Your platform for incremental goals and measurable outcomes. Let&apos;s get you set up.
          </p>
        </div>
        <Input
          label="What should we call you?"
          value={displayName}
          onChange={(e) => { setDisplayName(e.target.value); setNameError(null); }}
          placeholder="Your name"
          error={nameError ?? undefined}
          autoFocus
        />
        <Button onClick={handleWelcome} loading={false}>
          Continue
        </Button>
      </div>
    );
  }

  if (step === "first-goal") {
    const isBusy = completeOnboarding.isPending || createGoal.isPending;
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Set your first goal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Goals are the heart of Neu — pick something meaningful to you.
          </p>
        </div>

        {/* Category */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Category</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => { setCategory(cat.value); setGoalErrors((e) => ({ ...e, category: "" })); }}
                className={clsx(
                  "flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-xs font-medium transition",
                  category === cat.value
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-200 hover:border-gray-300 text-gray-700"
                )}
              >
                <span className="text-xl">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
          {goalErrors.category && <p className="mt-1 text-xs text-red-600">{goalErrors.category}</p>}
        </div>

        <Input
          label="Goal title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setGoalErrors((e) => ({ ...e, title: "" })); }}
          placeholder="e.g. Run 5km every day"
          error={goalErrors.title}
        />

        <div className="flex gap-3">
          <div className="flex-1">
            <Input
              label="Target value"
              type="number"
              min={0}
              step="any"
              value={numericTarget}
              onChange={(e) => { setNumericTarget(e.target.value); setGoalErrors((err) => ({ ...err, numericTarget: "" })); }}
              placeholder="e.g. 100"
              error={goalErrors.numericTarget}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Unit"
              value={unit}
              onChange={(e) => { setUnit(e.target.value); setGoalErrors((err) => ({ ...err, unit: "" })); }}
              placeholder="km, pages, %…"
              error={goalErrors.unit}
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Check-in cadence</p>
          <div className="flex gap-3">
            {(["daily", "weekly"] as GoalCadence[]).map((c) => (
              <button
                key={c}
                onClick={() => { setCadence(c); setGoalErrors((e) => ({ ...e, cadence: "" })); }}
                className={clsx(
                  "flex-1 rounded-xl border-2 p-3 text-sm font-medium capitalize transition",
                  cadence === c
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-gray-200 hover:border-gray-300 text-gray-700"
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {goalErrors.cadence && <p className="mt-1 text-xs text-red-600">{goalErrors.cadence}</p>}
        </div>

        <Input
          label="Target date"
          type="date"
          value={targetDate}
          onChange={(e) => { setTargetDate(e.target.value); setGoalErrors((err) => ({ ...err, targetDate: "" })); }}
          error={goalErrors.targetDate}
          min={new Date().toISOString().slice(0, 10)}
        />

        {(completeOnboarding.error || createGoal.error) && (
          <p className="text-sm text-red-600">
            {completeOnboarding.error?.message ?? createGoal.error?.message}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleCreateGoal} loading={isBusy}>
            Create goal &amp; go to dashboard
          </Button>
          <button
            onClick={handleSkipGoal}
            disabled={isBusy}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  return null;
}
