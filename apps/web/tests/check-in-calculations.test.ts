import { describe, expect, it } from "vitest";
import {
  calcProgressPct,
  calcProjectedCompletion,
  calcStreak,
} from "@/lib/trpc/routers/check-ins";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number, now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

function weeksAgo(n: number, now = new Date()): Date {
  return daysAgo(n * 7, now);
}

const GOAL_100 = { numeric_target: 100 };
const GOAL_DAILY: { numeric_target: number; cadence: "daily" } = {
  numeric_target: 100,
  cadence: "daily",
};
const GOAL_WEEKLY: { numeric_target: number; cadence: "weekly" } = {
  numeric_target: 100,
  cadence: "weekly",
};

// ---------------------------------------------------------------------------
// calcProgressPct
// ---------------------------------------------------------------------------

describe("calcProgressPct", () => {
  it("returns 0 with no check-ins", () => {
    expect(calcProgressPct(GOAL_100, [])).toBe(0);
  });

  it("returns 50 when latest value is half the target", () => {
    const checkIns = [{ value: 50, checked_at: daysAgo(1) }];
    expect(calcProgressPct(GOAL_100, checkIns)).toBe(50);
  });

  it("uses the most recent check-in value", () => {
    const checkIns = [
      { value: 20, checked_at: daysAgo(3) },
      { value: 80, checked_at: daysAgo(0) }, // most recent
      { value: 40, checked_at: daysAgo(1) },
    ];
    expect(calcProgressPct(GOAL_100, checkIns)).toBe(80);
  });

  it("can exceed 100% (overachievement)", () => {
    const checkIns = [{ value: 120, checked_at: daysAgo(0) }];
    expect(calcProgressPct(GOAL_100, checkIns)).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// calcStreak (daily)
// ---------------------------------------------------------------------------

describe("calcStreak - daily", () => {
  const now = new Date("2026-04-13T12:00:00Z");

  it("returns 0 with no check-ins", () => {
    expect(calcStreak([], "daily", now)).toBe(0);
  });

  it("returns 1 with a check-in only today", () => {
    expect(calcStreak([{ checked_at: new Date("2026-04-13T08:00:00Z") }], "daily", now)).toBe(1);
  });

  it("returns 3 for 3 consecutive days ending today", () => {
    const checkIns = [
      { checked_at: new Date("2026-04-13T08:00:00Z") },
      { checked_at: new Date("2026-04-12T08:00:00Z") },
      { checked_at: new Date("2026-04-11T08:00:00Z") },
    ];
    expect(calcStreak(checkIns, "daily", now)).toBe(3);
  });

  it("resets streak when a day is missed", () => {
    // Checked in today and 2 days ago, but NOT yesterday
    const checkIns = [
      { checked_at: new Date("2026-04-13T08:00:00Z") },
      { checked_at: new Date("2026-04-11T08:00:00Z") },
    ];
    expect(calcStreak(checkIns, "daily", now)).toBe(1);
  });

  it("ignores duplicate check-ins on the same day", () => {
    const checkIns = [
      { checked_at: new Date("2026-04-13T07:00:00Z") },
      { checked_at: new Date("2026-04-13T18:00:00Z") }, // same day
      { checked_at: new Date("2026-04-12T08:00:00Z") },
    ];
    expect(calcStreak(checkIns, "daily", now)).toBe(2);
  });

  it("returns 0 if the most recent check-in was yesterday (streak broken at today)", () => {
    const checkIns = [
      { checked_at: new Date("2026-04-12T08:00:00Z") },
      { checked_at: new Date("2026-04-11T08:00:00Z") },
    ];
    // Today (2026-04-13) has no check-in, so streak from today = 0
    expect(calcStreak(checkIns, "daily", now)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calcStreak (weekly)
// ---------------------------------------------------------------------------

describe("calcStreak - weekly", () => {
  const now = new Date("2026-04-13T12:00:00Z"); // week 16 of 2026

  it("returns 1 with a check-in this week only", () => {
    const checkIns = [{ checked_at: new Date("2026-04-13T08:00:00Z") }];
    expect(calcStreak(checkIns, "weekly", now)).toBe(1);
  });

  it("returns 2 for check-ins this week and last week", () => {
    const checkIns = [
      { checked_at: new Date("2026-04-13T08:00:00Z") }, // this week
      { checked_at: weeksAgo(1, now) },                  // last week
    ];
    expect(calcStreak(checkIns, "weekly", now)).toBe(2);
  });

  it("resets when a week is missed", () => {
    const checkIns = [
      { checked_at: new Date("2026-04-13T08:00:00Z") }, // this week
      { checked_at: weeksAgo(2, now) },                  // 2 weeks ago (gap)
    ];
    expect(calcStreak(checkIns, "weekly", now)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// calcProjectedCompletion
// ---------------------------------------------------------------------------

describe("calcProjectedCompletion", () => {
  it("returns null with fewer than 2 check-ins", () => {
    expect(calcProjectedCompletion(GOAL_DAILY, [])).toBeNull();
    expect(
      calcProjectedCompletion(GOAL_DAILY, [{ value: 10, checked_at: daysAgo(0) }])
    ).toBeNull();
  });

  it("returns a future date when progress is positive", () => {
    const checkIns = [
      { value: 0, checked_at: daysAgo(10) },
      { value: 50, checked_at: daysAgo(0) },
    ];
    // 50 units gained in 10 days → 50 more units needed → ~10 more days
    const projected = calcProjectedCompletion(GOAL_DAILY, checkIns);
    expect(projected).not.toBeNull();
    expect(projected!.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns approximately now when the goal is already achieved", () => {
    const checkIns = [
      { value: 60, checked_at: daysAgo(5) },
      { value: 100, checked_at: daysAgo(0) },
    ];
    const projected = calcProjectedCompletion(GOAL_DAILY, checkIns);
    // value reached target, so remaining = 0, should be the last check-in date
    expect(projected).not.toBeNull();
    // Should be within the last day
    expect(Date.now() - projected!.getTime()).toBeLessThan(86_400_000);
  });

  it("returns null when there is no positive progress trend", () => {
    const checkIns = [
      { value: 80, checked_at: daysAgo(5) },
      { value: 60, checked_at: daysAgo(0) }, // going backwards
    ];
    expect(calcProjectedCompletion(GOAL_DAILY, checkIns)).toBeNull();
  });
});
