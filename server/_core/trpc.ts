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

function getUser(ctx: any) {
  return ctx?.user ?? ctx?.session?.user ?? ctx?.auth?.user ?? null;
}

function getRole(ctx: any): string | undefined {
  const u = getUser(ctx);
  return u?.role ?? ctx?.session?.role ?? ctx?.user?.role;
}

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  const user = getUser(ctx);
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "UNAUTHED" });
  }
  (ctx as any).user = user;
  return next({ ctx });
});

export const adminOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = getRole(ctx);
  if (role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "ADMIN_ONLY" });
  }
  return next();
});

export const ownerOnlyProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = getRole(ctx);
  if (role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "OWNER_ONLY" });
  }
  return next();
});

// Aliases de compatibilidade (seu projeto importa esses nomes)
export const adminProcedure = adminOnlyProcedure;
export const ownerProcedure = ownerOnlyProcedure;
