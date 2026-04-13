/**
 * Integration test suite: auth + goal CRUD + check-in
 *
 * Exercises the tRPC procedures via createCaller with mocked sessions against
 * a real Postgres instance (RLS + schema must be applied).
 *
 * Each suite creates isolated fixtures and tears them down in afterAll.
 * DATABASE_URL must point to the test database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = process.env.DATABASE_URL;
if (!TEST_DB_URL) throw new Error("DATABASE_URL required for integration tests");

// Service-mode connection: superuser, no RLS enforcement. Used for fixture
// setup/teardown only. App code uses the singleton pool from lib/db/client.
const svc = postgres(TEST_DB_URL);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a tRPC context that mimics createTRPCContext but with a mocked session.
 * Imported lazily so setupFiles can set env vars before lib/db/client loads.
 */
async function makeCtx(userId: string) {
  const { sql, withUserContext } = await import("@/lib/db/client");
  return {
    session: { user: { id: userId, email: `${userId}@test.com`, name: "Test" } },
    db: sql,
    withUserContext: <T>(fn: (tx: import("postgres").TransactionSql) => Promise<T>) =>
      withUserContext(userId, fn),
  } as Awaited<ReturnType<typeof import("@/lib/trpc/context")["createTRPCContext"]>>;
}

async function makeCaller(userId: string) {
  const ctx = await makeCtx(userId);
  const { appRouter } = await import("@/lib/trpc/routers/root");
  return appRouter.createCaller(ctx);
}

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Fixture state (populated in beforeAll, cleaned in afterAll)
// ---------------------------------------------------------------------------

let userAId: string;
let userBId: string;
let wsAId: string;
let wsBId: string;

// Track created goal/check-in IDs for cleanup
const createdGoalIds: string[] = [];
const createdCheckInIds: string[] = [];

beforeAll(async () => {
  // Clean up leftover fixtures from previous runs
  await svc`DELETE FROM users WHERE email LIKE 'inttest-unit-%@test.internal'`;

  // User A
  [{ id: userAId }] = await svc<{ id: string }[]>`
    INSERT INTO users (email, display_name)
    VALUES ('inttest-unit-alice@test.internal', 'Alice')
    RETURNING id
  `;

  // User B
  [{ id: userBId }] = await svc<{ id: string }[]>`
    INSERT INTO users (email, display_name)
    VALUES ('inttest-unit-bob@test.internal', 'Bob')
    RETURNING id
  `;

  // Personal workspace for User A
  const wsA = await svc<{ workspace_id: string }[]>`
    WITH ws AS (
      INSERT INTO workspaces (slug, name, kind, plan)
      VALUES (${`personal-inttest-${userAId}`}, 'Alice Personal', 'personal', 'free')
      RETURNING id
    )
    INSERT INTO workspace_members (workspace_id, user_id, role)
    SELECT id, ${userAId}, 'owner' FROM ws
    RETURNING workspace_id
  `;
  wsAId = wsA[0].workspace_id;

  // Personal workspace for User B
  const wsB = await svc<{ workspace_id: string }[]>`
    WITH ws AS (
      INSERT INTO workspaces (slug, name, kind, plan)
      VALUES (${`personal-inttest-${userBId}`}, 'Bob Personal', 'personal', 'free')
      RETURNING id
    )
    INSERT INTO workspace_members (workspace_id, user_id, role)
    SELECT id, ${userBId}, 'owner' FROM ws
    RETURNING workspace_id
  `;
  wsBId = wsB[0].workspace_id;
});

afterAll(async () => {
  if (createdCheckInIds.length) {
    await svc`DELETE FROM check_ins WHERE id = ANY(${createdCheckInIds}::uuid[])`;
  }
  if (createdGoalIds.length) {
    await svc`DELETE FROM audit_log WHERE target_id = ANY(${createdGoalIds}::uuid[])`;
    await svc`DELETE FROM goals WHERE id = ANY(${createdGoalIds}::uuid[])`;
  }
  await svc`DELETE FROM workspace_members WHERE user_id IN (${userAId}, ${userBId})`;
  await svc`DELETE FROM workspaces WHERE id IN (${wsAId}, ${wsBId})`;
  await svc`DELETE FROM users WHERE id IN (${userAId}, ${userBId})`;
  await svc.end();
});

// ---------------------------------------------------------------------------
// Auth — users.register
// ---------------------------------------------------------------------------

describe("users.register", () => {
  const email = "inttest-register@test.internal";
  let registeredUserId: string;

  afterAll(async () => {
    if (registeredUserId) {
      await svc`DELETE FROM workspace_members WHERE user_id = ${registeredUserId}`;
      await svc`DELETE FROM workspaces WHERE slug = ${`personal-${registeredUserId}`}`;
      await svc`DELETE FROM users WHERE id = ${registeredUserId}`;
    }
    // Also clean up by email in case id wasn't captured
    await svc`
      WITH u AS (SELECT id FROM users WHERE email = ${email})
      DELETE FROM workspace_members WHERE user_id IN (SELECT id FROM u)
    `;
    await svc`DELETE FROM users WHERE email = ${email}`;
  });

  it("creates user + personal workspace", async () => {
    const { appRouter } = await import("@/lib/trpc/routers/root");
    const { sql } = await import("@/lib/db/client");
    const caller = appRouter.createCaller({
      session: null,
      db: sql,
      withUserContext: null,
    });

    const result = await caller.users.register({
      email,
      password: "secure-password-123",
      displayName: "Register Test User",
    });

    expect(result.email).toBe(email);
    expect(typeof result.userId).toBe("string");
    registeredUserId = result.userId;

    // Verify the personal workspace was auto-created
    const [ws] = await svc<{ kind: string; plan: string }[]>`
      SELECT w.kind, w.plan
      FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ${registeredUserId}
    `;
    expect(ws).toBeDefined();
    expect(ws.kind).toBe("personal");
    expect(ws.plan).toBe("free");
  });

  it("rejects duplicate email with CONFLICT", async () => {
    const { appRouter } = await import("@/lib/trpc/routers/root");
    const { sql } = await import("@/lib/db/client");
    const caller = appRouter.createCaller({
      session: null,
      db: sql,
      withUserContext: null,
    });

    await expect(
      caller.users.register({ email, password: "another-password" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

// ---------------------------------------------------------------------------
// users.me
// ---------------------------------------------------------------------------

describe("users.me", () => {
  it("returns current user profile", async () => {
    const caller = await makeCaller(userAId);
    const user = await caller.users.me();
    expect(user.id).toBe(userAId);
    expect(user.email).toBe("inttest-unit-alice@test.internal");
  });

  it("throws NOT_FOUND for deleted user", async () => {
    // Soft-delete temporarily
    await svc`UPDATE users SET deleted_at = now() WHERE id = ${userAId}`;
    const caller = await makeCaller(userAId);
    await expect(caller.users.me()).rejects.toMatchObject({ code: "NOT_FOUND" });
    await svc`UPDATE users SET deleted_at = NULL WHERE id = ${userAId}`;
  });
});

// ---------------------------------------------------------------------------
// goals.create + goals.list + goals.get
// ---------------------------------------------------------------------------

describe("goals — create / list / get", () => {
  it("creates a goal and lists it back", async () => {
    const caller = await makeCaller(userAId);

    const goal = await caller.goals.create({
      title: "Integration Test Goal",
      category: "work",
      numericTarget: 50,
      unit: "tasks",
      cadence: "weekly",
      targetDate: futureDate(30),
    });

    expect(goal.title).toBe("Integration Test Goal");
    expect(goal.workspace_id).toBe(wsAId);
    expect(goal.owner_user_id).toBe(userAId);
    expect(goal.status).toBe("active");
    createdGoalIds.push(goal.id);

    const list = await caller.goals.list();
    const found = list.find((g) => g.id === goal.id);
    expect(found).toBeDefined();
  });

  it("gets a specific goal by id", async () => {
    const caller = await makeCaller(userAId);
    const goal = await caller.goals.create({
      title: "Get Test Goal",
      category: "health",
      numericTarget: 10,
      unit: "km",
      cadence: "daily",
      targetDate: futureDate(14),
    });
    createdGoalIds.push(goal.id);

    const fetched = await caller.goals.get({ id: goal.id });
    expect(fetched.id).toBe(goal.id);
    expect(fetched.title).toBe("Get Test Goal");
  });

  it("throws NOT_FOUND when user A tries to get user B's goal", async () => {
    const [bGoal] = await svc<{ id: string }[]>`
      INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date)
      VALUES (${wsBId}, ${userBId}, 'Bobs Secret Goal', 'work', 100, 'items', 'weekly', ${futureDate(30)})
      RETURNING id
    `;
    createdGoalIds.push(bGoal.id);

    const callerA = await makeCaller(userAId);
    await expect(callerA.goals.get({ id: bGoal.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

// ---------------------------------------------------------------------------
// goals.update + goals.updateStatus
// ---------------------------------------------------------------------------

describe("goals — update and status transitions", () => {
  it("updates goal metadata", async () => {
    const caller = await makeCaller(userAId);
    const goal = await caller.goals.create({
      title: "Update Me",
      category: "learning",
      numericTarget: 20,
      unit: "pages",
      cadence: "daily",
      targetDate: futureDate(14),
    });
    createdGoalIds.push(goal.id);

    const updated = await caller.goals.update({
      id: goal.id,
      title: "Updated Title",
      numericTarget: 30,
    });
    expect(updated.title).toBe("Updated Title");
    expect(Number(updated.numeric_target)).toBe(30);
  });

  it("pauses and reactivates a goal", async () => {
    const caller = await makeCaller(userAId);
    const goal = await caller.goals.create({
      title: "Pause Me",
      category: "work",
      numericTarget: 5,
      unit: "reports",
      cadence: "weekly",
      targetDate: futureDate(30),
    });
    createdGoalIds.push(goal.id);

    const paused = await caller.goals.updateStatus({ id: goal.id, status: "paused" });
    expect(paused.status).toBe("paused");

    const reactivated = await caller.goals.updateStatus({ id: goal.id, status: "active" });
    expect(reactivated.status).toBe("active");
  });

  it("marks a goal as achieved", async () => {
    const caller = await makeCaller(userAId);
    const goal = await caller.goals.create({
      title: "Achieve Me",
      category: "health",
      numericTarget: 1,
      unit: "marathon",
      cadence: "daily",
      targetDate: futureDate(7),
    });
    createdGoalIds.push(goal.id);

    const achieved = await caller.goals.updateStatus({ id: goal.id, status: "achieved" });
    expect(achieved.status).toBe("achieved");
  });

  it("blocks abandoning a mandatory goal", async () => {
    // Create mandatory goal directly via SQL (manager-assigned path)
    const [mandatoryGoal] = await svc<{ id: string }[]>`
      INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date, is_mandatory)
      VALUES (${wsAId}, ${userAId}, 'Mandatory Goal', 'work', 10, 'tasks', 'weekly', ${futureDate(14)}, true)
      RETURNING id
    `;
    createdGoalIds.push(mandatoryGoal.id);

    const caller = await makeCaller(userAId);
    await expect(
      caller.goals.updateStatus({ id: mandatoryGoal.id, status: "abandoned" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ---------------------------------------------------------------------------
// goals.create — freemium gate
// ---------------------------------------------------------------------------

describe("goals — freemium gate", () => {
  // Use a dedicated user + workspace so prior tests don't affect the count.
  let freeUserId: string;
  let freeWsId: string;

  beforeAll(async () => {
    [{ id: freeUserId }] = await svc<{ id: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES ('inttest-unit-freemium@test.internal', 'Freemium User')
      RETURNING id
    `;
    const rows = await svc<{ workspace_id: string }[]>`
      WITH ws AS (
        INSERT INTO workspaces (slug, name, kind, plan)
        VALUES (${`personal-inttest-${freeUserId}`}, 'Free Personal', 'personal', 'free')
        RETURNING id
      )
      INSERT INTO workspace_members (workspace_id, user_id, role)
      SELECT id, ${freeUserId}, 'owner' FROM ws
      RETURNING workspace_id
    `;
    freeWsId = rows[0].workspace_id;
  });

  afterAll(async () => {
    await svc`DELETE FROM goals WHERE workspace_id = ${freeWsId}`;
    await svc`DELETE FROM workspace_members WHERE workspace_id = ${freeWsId}`;
    await svc`DELETE FROM workspaces WHERE id = ${freeWsId}`;
    await svc`DELETE FROM users WHERE id = ${freeUserId}`;
  });

  it("rejects creating a 4th goal on a free plan workspace", async () => {
    const caller = await makeCaller(freeUserId);

    // Fill up to 3 goals
    for (let i = 0; i < 3; i++) {
      await caller.goals.create({
        title: `Freemium Filler ${i}`,
        category: "other",
        numericTarget: 1,
        unit: "unit",
        cadence: "daily",
        targetDate: futureDate(7),
      });
    }

    // 4th should be rejected
    await expect(
      caller.goals.create({
        title: "Goal Over Limit",
        category: "other",
        numericTarget: 1,
        unit: "unit",
        cadence: "daily",
        targetDate: futureDate(7),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ---------------------------------------------------------------------------
// checkIns.create + checkIns.list + checkIns.stats
// ---------------------------------------------------------------------------

describe("checkIns — create / list / stats", () => {
  let goalId: string;

  beforeAll(async () => {
    // Create a goal with a pro-plan workspace so freemium gate doesn't interfere
    const [proPlan] = await svc<{ workspace_id: string }[]>`
      WITH ws AS (
        INSERT INTO workspaces (slug, name, kind, plan)
        VALUES (${`pro-inttest-${userAId}`}, 'Alice Pro', 'company', 'pro')
        RETURNING id
      )
      INSERT INTO workspace_members (workspace_id, user_id, role)
      SELECT id, ${userAId}, 'owner' FROM ws
      RETURNING workspace_id
    `;

    const [goal] = await svc<{ id: string }[]>`
      INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date)
      VALUES (${proPlan.workspace_id}, ${userAId}, 'Check-in Goal', 'health', 100, 'steps', 'daily', ${futureDate(30)})
      RETURNING id
    `;
    goalId = goal.id;
    createdGoalIds.push(goalId);
  });

  it("creates a check-in and lists it back", async () => {
    const caller = await makeCaller(userAId);

    const checkIn = await caller.checkIns.create({
      goalId,
      value: 5000,
      note: "Morning run",
    });

    expect(checkIn.goal_id).toBe(goalId);
    expect(Number(checkIn.value)).toBe(5000);
    expect(checkIn.user_id).toBe(userAId);
    createdCheckInIds.push(checkIn.id);

    const listed = await caller.checkIns.list({ goalId });
    expect(listed.some((c) => c.id === checkIn.id)).toBe(true);
  });

  it("returns computed stats: progressPct + streak", async () => {
    const caller = await makeCaller(userAId);
    const stats = await caller.checkIns.stats({ goalId });

    // Latest check-in value was 5000 of 100 target → 5000%
    expect(stats.progressPct).toBeGreaterThan(0);
    expect(typeof stats.streak).toBe("number");
    expect(stats.totalCheckIns).toBeGreaterThanOrEqual(1);
  });

  it("rejects check-in on an achieved goal", async () => {
    const caller = await makeCaller(userAId);
    await caller.goals.updateStatus({ id: goalId, status: "achieved" });

    await expect(
      caller.checkIns.create({ goalId, value: 100 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Restore for subsequent tests
    await svc`UPDATE goals SET status = 'active' WHERE id = ${goalId}`;
  });

  it("rejects check-in on an abandoned goal", async () => {
    const caller = await makeCaller(userAId);
    await caller.goals.updateStatus({ id: goalId, status: "abandoned" });

    await expect(
      caller.checkIns.create({ goalId, value: 100 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await svc`UPDATE goals SET status = 'active' WHERE id = ${goalId}`;
  });
});

// ---------------------------------------------------------------------------
// RLS via tRPC: cross-workspace data leak
// ---------------------------------------------------------------------------

describe("RLS via tRPC — cross-workspace isolation", () => {
  it("goals.list returns only the caller's own goals", async () => {
    // Create a goal for user B
    const [bGoal] = await svc<{ id: string }[]>`
      INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date)
      VALUES (${wsBId}, ${userBId}, 'Bob Exclusive Goal', 'work', 10, 'items', 'weekly', ${futureDate(7)})
      RETURNING id
    `;
    createdGoalIds.push(bGoal.id);

    // User A's goal list must not contain B's goal
    const callerA = await makeCaller(userAId);
    const listA = await callerA.goals.list();
    expect(listA.every((g) => g.owner_user_id === userAId)).toBe(true);
    expect(listA.find((g) => g.id === bGoal.id)).toBeUndefined();
  });

  it("checkIns.list returns empty for another user's goal (RLS enforced)", async () => {
    // Create a goal + check-in for user B
    const [bGoal] = await svc<{ id: string }[]>`
      INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date)
      VALUES (${wsBId}, ${userBId}, 'Bob Goal For CI', 'work', 10, 'items', 'weekly', ${futureDate(7)})
      RETURNING id
    `;
    createdGoalIds.push(bGoal.id);

    const [bCI] = await svc<{ id: string }[]>`
      INSERT INTO check_ins (goal_id, user_id, workspace_id, value)
      VALUES (${bGoal.id}, ${userBId}, ${wsBId}, 9)
      RETURNING id
    `;
    createdCheckInIds.push(bCI.id);

    // User A calling list with B's goalId: RLS + user_id filter both return 0 rows.
    const callerA = await makeCaller(userAId);
    const result = await callerA.checkIns.list({ goalId: bGoal.id });
    expect(result).toHaveLength(0);

    // Verify B's check-in is NOT in the result (belt-and-suspenders)
    expect(result.find((c) => c.id === bCI.id)).toBeUndefined();
  });
});
