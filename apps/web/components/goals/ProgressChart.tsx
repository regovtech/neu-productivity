"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface CheckIn {
  value: number;
  checked_at: Date | string;
}

interface Props {
  checkIns: CheckIn[];
  numericTarget: number;
  targetDate: string; // YYYY-MM-DD
}

function buildChartData(
  checkIns: CheckIn[],
  numericTarget: number,
  targetDate: string
) {
  if (checkIns.length === 0) return [];

  const sorted = [...checkIns].sort(
    (a, b) =>
      new Date(a.checked_at).getTime() - new Date(b.checked_at).getTime()
  );

  const startDate = new Date(sorted[0]!.checked_at);
  const endDate = new Date(targetDate);
  const totalMs = endDate.getTime() - startDate.getTime();

  return sorted.map((ci) => {
    const ciDate = new Date(ci.checked_at);
    const elapsed = ciDate.getTime() - startDate.getTime();
    const rampTarget =
      totalMs > 0
        ? Math.min(numericTarget, (elapsed / totalMs) * numericTarget)
        : numericTarget;

    return {
      date: ciDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      Actual: Number(ci.value),
      Target: Math.round(rampTarget * 100) / 100,
    };
  });
}

export function ProgressChart({ checkIns, numericTarget, targetDate }: Props) {
  if (checkIns.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">
        No check-ins yet — your chart will appear here.
      </div>
    );
  }

  const data = buildChartData(checkIns, numericTarget, targetDate);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            fontSize: 12,
            border: "1px solid #e5e7eb",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        <Line
          type="monotone"
          dataKey="Actual"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="Target"
          stroke="#d1d5db"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
