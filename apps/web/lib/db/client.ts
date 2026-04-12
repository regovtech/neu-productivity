import postgres from "postgres";
import { env } from "@/lib/env";

// Single connection pool shared across the app (Next.js edge-compatible).
// In development, reuse across HMR hot reloads.
declare global {
  // eslint-disable-next-line no-var
  var _pgSql: postgres.Sql | undefined;
}

function createSql() {
  return postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export const sql: postgres.Sql =
  process.env.NODE_ENV === "development"
    ? (globalThis._pgSql ?? (globalThis._pgSql = createSql()))
    : createSql();

/**
 * Run a block inside a transaction with the app.current_user_id session
 * variable set — required for RLS policies to resolve correctly.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return fn(tx);
  });
}
