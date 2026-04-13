import Link from "next/link";
import { GoalDetail } from "./GoalDetail";

export default function GoalDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-4">
      <Link href="/goals" className="text-sm text-brand-600 hover:underline">
        ← Back to goals
      </Link>
      <GoalDetail goalId={params.id} />
    </div>
  );
}
