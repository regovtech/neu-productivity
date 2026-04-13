import { auth } from "@/lib/auth/config";
import { sql, withUserContext } from "@/lib/db/client";
import type { inferAsyncReturnType } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type postgres from "postgres";

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const session = await auth();
  const userId = session?.user?.id;
  return {
    session,
    db: sql,
    withUserContext: userId
      ? <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) =>
          withUserContext(userId, fn)
      : null,
  };
}

export type TRPCContext = inferAsyncReturnType<typeof createTRPCContext>;
