import { initTRPC, TRPCError } from "@trpc/server";
import * as Sentry from "@sentry/nextjs";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TRPCContext } from "./context";

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Report unexpected server errors to Sentry. Skip expected client errors
    // (BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT) — those
    // represent normal application flow and would pollute error tracking.
    const clientCodes = new Set([
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "PARSE_ERROR",
    ]);
    if (!clientCodes.has(error.code) && error.cause) {
      Sentry.captureException(error.cause, {
        tags: { trpc_code: error.code, trpc_path: shape.data?.path },
      });
    }

    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Middleware: require authenticated session */
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  // Cast to narrow the session type for downstream procedures.
  const session = ctx.session as NonNullable<typeof ctx.session> & {
    user: NonNullable<(typeof ctx.session)["user"]> & { id: string };
  };
  return next({ ctx: { session } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
