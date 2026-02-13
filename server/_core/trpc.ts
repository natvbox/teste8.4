import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

/**
 * Inicialização do tRPC
 * Aqui definimos:
 * - Contexto
 * - Middlewares
 * - Proteções de rota
 */
const t = initTRPC.context<Context>().create();

/**
 * Router base
 */
export const router = t.router;

/**
 * Procedures públicas
 */
export const publicProcedure = t.procedure;

/**
 * ============================
 * 🔐 AUTH MIDDLEWARE
 * ============================
 */
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Não autenticado",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * ============================
 * 👤 PROTECTED
 * ============================
 */
export const protectedProcedure = t.procedure.use(isAuthed);

/**
 * ============================
 * 🧑‍💼 ADMIN ONLY
 * ============================
 */
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Não autenticado",
    });
  }

  if (ctx.user.role !== "admin" && ctx.user.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas admin ou owner",
    });
  }

  return next();
});

export const adminOnlyProcedure = t.procedure.use(isAdmin);

/**
 * ============================
 * 👑 OWNER ONLY
 * ============================
 */
const isOwner = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Não autenticado",
    });
  }

  if (ctx.user.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas owner",
    });
  }

  return next();
});

export const ownerOnlyProcedure = t.procedure.use(isOwner);

/**
 * ============================
 * 🧠 ERROR FORMATTER
 * Evita erro: "Unable to transform response from server"
 * ============================
 */
export const createCallerFactory = t.createCallerFactory;
