/**
 * Integration test: two-workspace RLS isolation.
 *
 * Validates that a user in workspace A cannot see goals belonging to workspace B,
 * even if they share the same Postgres connection pool.
 *
 * Requires a real Postgres instance with migrations applied.
 * DATABASE_URL must point to a test database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

const TEST_DB_URL = process.env.DATABASE_URL;
if (!TEST_DB_URL) throw new Error("DATABASE_URL required for RLS tests");

const sql = postgres(TEST_DB_URL);

let wsAId: string;
let wsBId: string;
let userAId: string;
let userBId: string;
let goalAId: string;
let goalBId: string;

beforeAll(async () => {
  // Workspace A
  [{ id: wsAId }] = await sql<{ id: string }[]>`
    INSERT INTO workspaces (slug, name, kind, plan)
    VALUES ('rls-test-ws-a', 'RLS Test A', 'company', 'free')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id
  `;

  // Workspace B
  [{ id: wsBId }] = await sql<{ id: string }[]>`
    INSERT INTO workspaces (slug, name, kind, plan)
    VALUES ('rls-test-ws-b', 'RLS Test B', 'company', 'free')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id
  `;

  // Users
  [{ id: userAId }] = await sql<{ id: string }[]>`
    INSERT INTO users (email, display_name)
    VALUES ('rls-alice@test.com', 'RLS Alice')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id
  `;
  [{ id: userBId }] = await sql<{ id: string }[]>`
    INSERT INTO users (email, display_name)
    VALUES ('rls-bob@test.com', 'RLS Bob')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id
  `;

  // Memberships
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (${wsAId}, ${userAId}, 'owner'), (${wsBId}, ${userBId}, 'owner')
    ON CONFLICT DO NOTHING
  `;

  // Goals — one per workspace
  [{ id: goalAId }] = await sql<{ id: string }[]>`
    INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date)
    VALUES (${wsAId}, ${userAId}, 'Workspace A Goal', 'work', 10, 'tasks', 'weekly', now() + interval '30 days')
    RETURNING id
  `;
  [{ id: goalBId }] = await sql<{ id: string }[]>`
    INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date)
    VALUES (${wsBId}, ${userBId}, 'Workspace B Goal', 'work', 10, 'tasks', 'weekly', now() + interval '30 days')
    RETURNING id
  `;
});

afterAll(async () => {
  // Clean up test fixtures
  await sql`DELETE FROM goals WHERE id IN (${goalAId}, ${goalBId})`;
  await sql`DELETE FROM workspace_members WHERE workspace_id IN (${wsAId}, ${wsBId})`;
  await sql`DELETE FROM users WHERE id IN (${userAId}, ${userBId})`;
  await sql`DELETE FROM workspaces WHERE id IN (${wsAId}, ${wsBId})`;
  await sql.end();
});

describe("RLS: workspace isolation", () => {
  it("user A sees only their own workspace goals", async () => {
    const goals = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${userAId}, true)`;
      return tx<{ id: string }[]>`SELECT id FROM goals WHERE workspace_id IN (${wsAId}, ${wsBId})`;
    });
    const ids = goals.map((g) => g.id);
    expect(ids).toContain(goalAId);
    expect(ids).not.toContain(goalBId);
  });

  it("user B sees only their own workspace goals", async () => {
    const goals = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${userBId}, true)`;
      return tx<{ id: string }[]>`SELECT id FROM goals WHERE workspace_id IN (${wsAId}, ${wsBId})`;
    });
    const ids = goals.map((g) => g.id);
    expect(ids).toContain(goalBId);
    expect(ids).not.toContain(goalAId);
  });

  it("no cross-workspace data leaks via check_ins", async () => {
    // Insert a check-in for A's goal as userA
    const [ci] = await sql<{ id: string }[]>`
      INSERT INTO check_ins (goal_id, user_id, workspace_id, value)
      VALUES (${goalAId}, ${userAId}, ${wsAId}, 5)
      RETURNING id
    `;

    // UserB should not see it
    const result = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${userBId}, true)`;
      return tx<{ id: string }[]>`SELECT id FROM check_ins WHERE id = ${ci.id}`;
    });
    expect(result).toHaveLength(0);

    // Cleanup
    await sql`DELETE FROM check_ins WHERE id = ${ci.id}`;
  });
});
