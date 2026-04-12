import { auth } from "@/lib/auth/config";
import { sql, withUserContext } from "@/lib/db/client";
import type { inferAsyncReturnType } from "@trpc/server";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";

export async function createTRPCContext(opts: FetchCreateContextFnOptions) {
  const session = await auth();
  return {
    session,
    db: sql,
    withUserContext: session?.user?.id
      ? <T>(fn: Parameters<typeof withUserContext>[1]) =>
          withUserContext(session.user.id, fn)
      : null,
  };
}

export type TRPCContext = inferAsyncReturnType<typeof createTRPCContext>;
