/**
 * Dev seed: creates two isolated workspaces + users.
 * Also serves as the baseline for RLS integration tests.
 *
 * Run: DATABASE_URL=... pnpm db:seed
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function seed() {
  console.log("Seeding dev database…");

  // Workspace A
  const [wsA] = await sql<{ id: string }[]>`
    INSERT INTO workspaces (slug, name, kind, plan)
    VALUES ('dev-workspace-a', 'Dev Corp A', 'company', 'trial')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  // Workspace B (isolated — should never see A's data)
  const [wsB] = await sql<{ id: string }[]>`
    INSERT INTO workspaces (slug, name, kind, plan)
    VALUES ('dev-workspace-b', 'Dev Corp B', 'company', 'trial')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

  // User in A
  const [userA] = await sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, password_hash)
    VALUES ('alice@example.com', 'Alice', 'SEED_HASH_NOT_REAL')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id
  `;

  // User in B
  const [userB] = await sql<{ id: string }[]>`
    INSERT INTO users (email, display_name, password_hash)
    VALUES ('bob@example.com', 'Bob', 'SEED_HASH_NOT_REAL')
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id
  `;

  // Memberships
  await sql`
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES
      (${wsA.id}, ${userA.id}, 'owner'),
      (${wsB.id}, ${userB.id}, 'owner')
    ON CONFLICT DO NOTHING
  `;

  // A goal for Alice in workspace A
  await sql`
    INSERT INTO goals (workspace_id, owner_user_id, title, category, numeric_target, unit, cadence, target_date)
    VALUES (${wsA.id}, ${userA.id}, 'Run 100km this month', 'health', 100, 'km', 'daily', now() + interval '30 days')
    ON CONFLICT DO NOTHING
  `;

  console.log(`Seeded:
  Workspace A: ${wsA.id} (alice@example.com)
  Workspace B: ${wsB.id} (bob@example.com)
  `);

  await sql.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
