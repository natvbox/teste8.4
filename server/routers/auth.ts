import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "../_core/env";
import { TRPCError } from "@trpc/server";
import {
  hashPassword,
  isValidLoginIdOrEmail,
  isValidPassword,
  verifyPassword,
} from "../_core/password";
import { COOKIE_NAME } from "@shared/const";

/**
 * Build cookie corretamente para Render (HTTPS)
 */
function buildCookie(name: string, value: string, maxAgeSeconds: number) {
  const isProd = ENV.isProduction;
  const secure = isProd;
  const sameSite = secure ? "None" : "Lax";

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${sameSite}`,
    `HttpOnly`,
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}

function clearCookie(name: string) {
  const isProd = ENV.isProduction;
  const secure = isProd;
  const sameSite = secure ? "None" : "Lax";

  const parts = [
    `${name}=`,
    `Path=/`,
    `Max-Age=0`,
    `SameSite=${sameSite}`,
    `HttpOnly`,
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}

export const authRouter = router({
  /**
   * Login local (SEM dependências externas)
   */
  login: publicProcedure
    .input(
      z.object({
        loginId: z.string().min(3),
        password: z.string().min(4),
        name: z.string().optional(),
        email: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // ✅ fonte única do cookie name (mesmo que o sdk lê)
      const cookieName = COOKIE_NAME;

      const openId = input.loginId.trim().toLowerCase();

      if (!isValidLoginIdOrEmail(openId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Usuário inválido. Use login (letras/números e ; . _ -) ou e-mail válido",
        });
      }

      if (!isValidPassword(input.password)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Senha inválida. Use letras, números e caracteres ; . _ -",
        });
      }

      const existing = await getUserByOpenId(openId);
      const now = new Date();

      // Se já existe e tem senha, validar
      if (existing?.passwordHash) {
        const ok = verifyPassword(input.password, existing.passwordHash);

        if (!ok) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Usuário ou senha incorretos",
          });
        }
      }

      // Se não existir ou não tiver senha → define no primeiro login
      const passwordHash = existing?.passwordHash
        ? undefined
        : hashPassword(input.password);

      await upsertUser({
        openId,
        name: input.name ?? existing?.name ?? null,
        email: input.email ?? existing?.email ?? null,
        loginMethod: "local",
        passwordHash,
        lastSignedIn: now,
      } as any);

      const token = await sdk.createSessionToken(openId);

      const header = buildCookie(
        cookieName,
        token,
        60 * 60 * 24 * 30 // 30 dias
      );

      ctx.res.setHeader("Set-Cookie", header);

      return { success: true };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const cookieName = COOKIE_NAME;

    ctx.res.setHeader("Set-Cookie", clearCookie(cookieName));
    return { success: true };
  }),

  me: protectedProcedure.query(({ ctx }) => {
    return { user: ctx.user };
  }),
});
