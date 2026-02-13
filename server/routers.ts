import { router } from "./_core/trpc";

import { authRouter } from "./routers/auth";
import { usersRouter } from "./routers/users";
import { groupsRouter } from "./routers/groups";
import { notificationsRouter } from "./routers/notifications";
import { uploadRouter } from "./routers/upload";
import { tenantRouter } from "./routers/tenant";
import { superAdminRouter } from "./routers/superadmin";
import { filesRouter } from "./routers/files";

/**
 * Router principal do backend (AppRouter)
 * Todos os módulos do sistema são registrados aqui.
 */
export const appRouter = router({
  auth: authRouter,
  users: usersRouter,
  groups: groupsRouter,
  notifications: notificationsRouter,
  upload: uploadRouter,
  tenant: tenantRouter,
  superAdmin: superAdminRouter,
  files: filesRouter,
});

/**
 * Tipo do backend para o frontend (tRPC)
 */
export type AppRouter = typeof appRouter;
