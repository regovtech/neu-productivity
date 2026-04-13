"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";

export function DeleteAccountSection() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestDeletion = trpc.users.requestDeletion.useMutation({
    onSuccess: () => {
      router.push("/deletion-scheduled");
    },
    onError: (err) => setError(err.message),
  });

  if (confirming) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h3 className="mb-2 font-semibold text-red-900">Are you sure?</h3>
        <p className="mb-4 text-sm text-red-700">
          Your account will be immediately hidden and permanently deleted after 30 days. You can
          cancel within that window.
        </p>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={() => requestDeletion.mutate()}
            disabled={requestDeletion.isPending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {requestDeletion.isPending ? "Scheduling…" : "Yes, delete my account"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 p-6">
      <h3 className="mb-1 font-semibold text-gray-900">Delete account</h3>
      <p className="mb-4 text-sm text-gray-500">
        Permanently delete your account and all associated data. This action is scheduled for 30
        days from your request — you can cancel within that window.
      </p>
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
      >
        Delete account
      </button>
    </div>
  );
}
