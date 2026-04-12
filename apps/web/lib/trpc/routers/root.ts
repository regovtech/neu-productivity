import { router } from "@/lib/trpc/init";
import { usersRouter } from "./users";
// Sprint 2: import { goalsRouter } from "./goals";
// Sprint 2: import { checkInsRouter } from "./check-ins";
// Sprint 3: import { workspacesRouter } from "./workspaces";

export const appRouter = router({
  users: usersRouter,
  // goals: goalsRouter,
  // checkIns: checkInsRouter,
  // workspaces: workspacesRouter,
});

export type AppRouter = typeof appRouter;
