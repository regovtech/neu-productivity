import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TRPCContext } from "./context";

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
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
