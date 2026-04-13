import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account deletion scheduled — Neu" };

export default function DeletionScheduledPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="mb-3 text-2xl font-bold text-gray-900">Deletion scheduled</h1>
      <p className="mb-6 max-w-md text-gray-500">
        Your account will be permanently deleted in 30 days. Until then it is hidden from all
        workspaces. If you change your mind, sign in and cancel from{" "}
        <Link href="/settings/account" className="text-brand-600 hover:underline">
          Account Settings
        </Link>
        .
      </p>
      <Link
        href="/login"
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        Back to login
      </Link>
    </div>
  );
}
