"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { GoalCategory, GoalCadence } from "@/lib/trpc/routers/goals";
import { clsx } from "clsx";

interface WizardState {
  category: GoalCategory | "";
  title: string;
  description: string;
  numericTarget: string;
  unit: string;
  cadence: GoalCadence | "";
  targetDate: string;
}

const INITIAL_STATE: WizardState = {
  category: "",
  title: "",
  description: "",
  numericTarget: "",
  unit: "",
  cadence: "",
  targetDate: "",
};

const CATEGORIES: { value: GoalCategory; label: string; emoji: string }[] = [
  { value: "health", label: "Health", emoji: "💪" },
  { value: "work", label: "Work", emoji: "💼" },
  { value: "learning", label: "Learning", emoji: "📚" },
  { value: "finance", label: "Finance", emoji: "💰" },
  { value: "other", label: "Other", emoji: "⭐" },
];

const STEPS = ["Category", "Details", "Target", "Schedule"] as const;

export function NewGoalWizard({ isLocked }: { isLocked: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Partial<Record<keyof WizardState, string>>>({});

  const createGoal = trpc.goals.create.useMutation({
    onSuccess: (goal) => {
      router.push(`/goals/${goal.id}`);
    },
  });

  if (isLocked) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-amber-800">Free plan limit reached</p>
        <p className="mt-2 text-sm text-amber-700">
          You&apos;ve used all 3 goal slots. Upgrade to Pro to create unlimited goals.
        </p>
        <button className="mt-4 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
          Upgrade to Pro
        </button>
      </div>
    );
  }

  function update<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  function validateStep(): boolean {
    const errs: Partial<Record<keyof WizardState, string>> = {};
    if (step === 0 && !form.category) errs.category = "Pick a category";
    if (step === 1) {
      if (!form.title.trim()) errs.title = "Title is required";
      else if (form.title.length > 200) errs.title = "Max 200 characters";
    }
    if (step === 2) {
      const n = parseFloat(form.numericTarget);
      if (!form.numericTarget || isNaN(n) || n <= 0) errs.numericTarget = "Enter a positive number";
      if (!form.unit.trim()) errs.unit = "Unit is required (e.g. km, pages, %)";
    }
    if (step === 3) {
      if (!form.cadence) errs.cadence = "Select a cadence";
      if (!form.targetDate) errs.targetDate = "Target date is required";
      else if (new Date(form.targetDate) <= new Date()) errs.targetDate = "Target date must be in the future";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleNext() {
    if (!validateStep()) return;
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      // Submit
      createGoal.mutate({
        category: form.category as GoalCategory,
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        numericTarget: parseFloat(form.numericTarget),
        unit: form.unit.trim(),
        cadence: form.cadence as GoalCadence,
        targetDate: form.targetDate,
      });
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Step progress */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={clsx(
                "h-2 w-full rounded-full transition-colors",
                i <= step ? "bg-brand-500" : "bg-gray-200"
              )}
            />
            <span className={clsx("text-xs", i === step ? "text-brand-700 font-semibold" : "text-gray-400")}>
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        {/* Step 0: Category */}
        {step === 0 && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">What area of life?</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => update("category", cat.value)}
                  className={clsx(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-medium transition",
                    form.category === cat.value
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-gray-200 hover:border-gray-300 text-gray-700"
                  )}
                >
                  <span className="text-2xl">{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>
            {errors.category && <p className="mt-2 text-xs text-red-600">{errors.category}</p>}
          </div>
        )}

        {/* Step 1: Title + description */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Name your goal</h2>
            <Input
              label="Goal title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. Run 5km every day"
              error={errors.title}
              autoFocus
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Description <span className="text-gray-400">(optional)</span>
              </label>
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Why does this goal matter to you?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>
        )}

        {/* Step 2: Target (numeric + unit) */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Set a measurable target</h2>
            <p className="text-sm text-gray-500">
              Define a number you&apos;re aiming to reach. You&apos;ll track progress with each check-in.
            </p>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  label="Target value"
                  type="number"
                  min={0}
                  step="any"
                  value={form.numericTarget}
                  onChange={(e) => update("numericTarget", e.target.value)}
                  placeholder="e.g. 100"
                  error={errors.numericTarget}
                  autoFocus
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Unit"
                  value={form.unit}
                  onChange={(e) => update("unit", e.target.value)}
                  placeholder="km, pages, %…"
                  error={errors.unit}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Cadence + target date */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Set your schedule</h2>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Check-in cadence</p>
              <div className="flex gap-3">
                {(["daily", "weekly"] as GoalCadence[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => update("cadence", c)}
                    className={clsx(
                      "flex-1 rounded-xl border-2 p-3 text-sm font-medium capitalize transition",
                      form.cadence === c
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-gray-200 hover:border-gray-300 text-gray-700"
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {errors.cadence && <p className="mt-1 text-xs text-red-600">{errors.cadence}</p>}
            </div>
            <Input
              label="Target completion date"
              type="date"
              value={form.targetDate}
              onChange={(e) => update("targetDate", e.target.value)}
              error={errors.targetDate}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 0 ? (
            <Button variant="outline" className="w-auto px-4" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          ) : (
            <div />
          )}
          <Button
            className="w-auto px-6"
            loading={createGoal.isPending}
            onClick={handleNext}
          >
            {step < STEPS.length - 1 ? "Continue" : "Create goal"}
          </Button>
        </div>

        {createGoal.error && (
          <p className="mt-3 text-sm text-red-600">{createGoal.error.message}</p>
        )}
      </div>
    </div>
  );
}
