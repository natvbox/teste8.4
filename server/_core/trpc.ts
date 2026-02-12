import { initTRPC, TRPCError } from "@trpc/server";
import type { inferAsyncReturnType } from "@trpc/server";
import superjson from "superjson";

import { createContext } from "./context";

export type TrpcContext = inferAsyncReturnType<typeof createContext>;

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  // Mantém serialização JSON padrão para compatibilidade entre cliente e servidor.
});

export const router = t.router;
export const middleware = t.middleware;

/**
 * Procedimento público (sem auth)
 */
export const publicProcedure = t.procedure;

/**
 * Middleware de autenticação
 */
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
