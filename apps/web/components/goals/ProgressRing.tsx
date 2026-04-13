"use client";

interface ProgressRingProps {
  pct: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function ProgressRing({ pct, size = 56, strokeWidth = 5, className }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-label={`${Math.round(clamped)}% complete`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#16a34a"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.4s ease" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-gray-700 text-[10px] font-semibold"
        style={{ fontSize: size < 50 ? 8 : 10 }}
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  );
}
