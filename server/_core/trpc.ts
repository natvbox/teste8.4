import { initTRPC, TRPCError } from "@trpc/server";
import type { inferAsyncReturnType } from "@trpc/server";
import superjson from "superjson";

import { createContext } from "./context";

export type TrpcContext = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Helpers tolerantes: funcionam mesmo que seu contexto guarde o usuário
 * em ctx.user OU em ctx.session (dependendo de como você implementou).
 */
function getUser(ctx: any) {
  return ctx?.user ?? ctx?.session?.user ?? ctx?.auth?.user ?? null;
}

function getRole(ctx: any): string | undefined {
  const u = getUser(ctx);
  return u?.role ?? ctx?.session?.role ?? ctx?.user?.role;
}

/**
 * ✅ Logado
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const user = getUser(ctx);
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHED" });
  }
  // Se quiser, você pode garantir que ctx.user sempre exista daqui pra frente:
  (ctx as any).user = user;
  return next({ ctx });
});

/**
 * ✅ Admin only
 */
export const adminOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = getRole(ctx);
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY" });
  }
  return next();
});

/**
 * ✅ Owner only
 */
export const ownerOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = getRole(ctx);
  if (role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "OWNER_ONLY" });
  }
  return next();
});

/**
 * Compatibilidade: alguns arquivos importam "adminProcedure"
 */
export const adminProcedure = adminOnlyProcedure;
