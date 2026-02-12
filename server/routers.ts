import { router } from "./_core/trpc";

import { systemRouter } from "./_core/systemRouter";
import { authRouter } from "./routers/auth";
import { notificationsRouter } from "./routers/notifications";
import { groupsRouter } from "./routers/groups";
import { filesRouter } from "./routers/files";
import { uploadRouter } from "./routers/upload";
import { tenantRouter } from "./routers/tenant";
import { superAdminRouter } from "./routers/superadmin";

/**
 * Router principal da aplicação
 * Todas as rotas tRPC passam por aqui
 */
export const appRouter = router({
  system: systemRouter,        // health/debug
  auth: authRouter,            // login/logout/me
  notifications: notificationsRouter,
  groups: groupsRouter,
  files: filesRouter,
  upload: uploadRouter,
  tenant: tenantRouter,
  superadmin: superAdminRouter,
});

export type AppRouter = typeof appRouter;
