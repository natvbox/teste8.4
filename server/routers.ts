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
 * Todas as rotas tRPC passam por aqui em /api/trpc
 *
 * Observação:
 * - front usa: trpc.superadmin.* (minúsculo)
 * - e o backend exporta: superadmin (minúsculo) ✅
 */
export const appRouter = router({
  system: systemRouter, // health/debug
  auth: authRouter, // login/logout/me

  // Core: mensagens/inbox
  notifications: notificationsRouter,

  // Tenant admin features
  tenant: tenantRouter,
  groups: groupsRouter,
  files: filesRouter,
  upload: uploadRouter,

  // Owner features
  superadmin: superAdminRouter,
});

export type AppRouter = typeof appRouter;
