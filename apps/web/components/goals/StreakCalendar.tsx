"use client";

interface CheckIn {
  checked_at: Date | string;
}

interface Props {
  checkIns: CheckIn[];
  cadence: "daily" | "weekly";
}

/** ISO week string e.g. "2026-W15" */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Build a list of the last N weeks of Mon–Sun columns. */
function buildWeeks(numWeeks: number): Date[][] {
  const today = new Date();
  // Find the most recent Sunday (end of current week for display)
  const endSunday = new Date(today);
  endSunday.setDate(today.getDate() + (7 - (today.getDay() || 7)));
  endSunday.setHours(0, 0, 0, 0);

  const weeks: Date[][] = [];
  for (let w = numWeeks - 1; w >= 0; w--) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(endSunday);
      day.setDate(endSunday.getDate() - w * 7 - (6 - d));
      week.push(day);
    }
    weeks.push(week);
  }
  return weeks;
}

export function StreakCalendar({ checkIns, cadence }: Props) {
  const NUM_WEEKS = 12;
  const weeks = buildWeeks(NUM_WEEKS);

  const presentKeys = new Set(
    checkIns.map((ci) => {
      const d = new Date(ci.checked_at);
      return cadence === "daily" ? isoDay(d) : isoWeek(d);
    })
  );

  const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1 min-w-max">
        {/* Day labels */}
        <div className="flex gap-1 pl-px">
          {DAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="w-5 text-center text-[10px] text-gray-400 select-none"
            >
              {label}
            </span>
          ))}
        </div>
        {/* Week rows */}
        {weeks.map((week, wi) => (
          <div key={wi} className="flex gap-1">
            {week.map((day, di) => {
              const key = cadence === "daily" ? isoDay(day) : isoWeek(day);
              const checked = presentKeys.has(key);
              const label = day.toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              });
              return (
                <div
                  key={di}
                  title={`${label} — ${checked ? "checked in" : "no check-in"}`}
                  className={[
                    "w-5 h-5 rounded-sm cursor-default transition-colors",
                    checked ? "bg-green-400" : "bg-gray-100",
                  ].join(" ")}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
