"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import type { GoalStatus } from "@/lib/trpc/routers/goals";

interface GoalStatusActionsProps {
  goalId: string;
  currentStatus: GoalStatus;
}

const CONFIRM_MESSAGES: Partial<Record<GoalStatus, string>> = {
  achieved: "Mark this goal as achieved? This cannot be undone.",
  abandoned: "Abandon this goal? This cannot be undone.",
};

export function GoalStatusActions({ goalId, currentStatus }: GoalStatusActionsProps) {
  const router = useRouter();
  const [pendingStatus, setPendingStatus] = useState<GoalStatus | null>(null);
  const [, startTransition] = useTransition();

  const updateStatus = trpc.goals.updateStatus.useMutation({
    onSuccess: () => {
      router.refresh();
      setPendingStatus(null);
    },
  });

  function handleAction(status: GoalStatus) {
    const confirmMsg = CONFIRM_MESSAGES[status];
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    startTransition(() => {
      updateStatus.mutate({ id: goalId, status });
    });
    setPendingStatus(status);
  }

  if (currentStatus === "achieved" || currentStatus === "abandoned") {
    return (
      <p className="text-sm text-gray-400 italic">
        This goal is {currentStatus}.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {currentStatus === "active" && (
        <Button
          variant="outline"
          className="w-auto text-xs py-1.5 px-3"
          loading={pendingStatus === "paused" && updateStatus.isPending}
          onClick={() => handleAction("paused")}
        >
          Pause
        </Button>
      )}
      {currentStatus === "paused" && (
        <Button
          variant="secondary"
          className="w-auto text-xs py-1.5 px-3"
          loading={pendingStatus === "active" && updateStatus.isPending}
          onClick={() => handleAction("active")}
        >
          Resume
        </Button>
      )}
      <Button
        variant="secondary"
        className="w-auto text-xs py-1.5 px-3 text-green-700 bg-green-50 hover:bg-green-100"
        loading={pendingStatus === "achieved" && updateStatus.isPending}
        onClick={() => handleAction("achieved")}
      >
        Mark achieved
      </Button>
      <Button
        variant="outline"
        className="w-auto text-xs py-1.5 px-3 text-red-600 hover:bg-red-50"
        loading={pendingStatus === "abandoned" && updateStatus.isPending}
        onClick={() => handleAction("abandoned")}
      >
        Abandon
      </Button>
      {updateStatus.error && (
        <p className="w-full text-xs text-red-600">{updateStatus.error.message}</p>
      )}
    </div>
  );
}
