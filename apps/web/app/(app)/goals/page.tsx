import Link from "next/link";
import { GoalsList } from "./GoalsList";

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
        <Link
          href="/goals/new"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          New goal
        </Link>
      </div>
      <GoalsList />
    </div>
  );
}
