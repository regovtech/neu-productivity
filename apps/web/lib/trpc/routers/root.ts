import { router } from "@/lib/trpc/init";
import { usersRouter } from "./users";
import { goalsRouter } from "./goals";
import { checkInsRouter } from "./check-ins";
import { workspacesRouter } from "./workspaces";
import { invitesRouter } from "./invites";
import { remindersRouter } from "./reminders";
import { departmentsRouter } from "./departments";
import { managerRouter } from "./manager";

export const appRouter = router({
  users: usersRouter,
  goals: goalsRouter,
  checkIns: checkInsRouter,
  workspaces: workspacesRouter,
  invites: invitesRouter,
  reminders: remindersRouter,
  departments: departmentsRouter,
  manager: managerRouter,
});

export type AppRouter = typeof appRouter;
