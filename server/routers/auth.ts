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

/**
 * Cookie para Render/HTTPS:
 * - Prod: Secure + SameSite=None
 * - Dev: SameSite=Lax
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
      // ✅ fonte única (mesmo que o sdk lê)
      const cookieName = ENV.sessionCookieName || "app_session_id";

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

      // ✅ se existe e tem hash: valida
      if (existing?.passwordHash) {
        const ok = verifyPassword(input.password, existing.passwordHash);
        if (!ok) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Usuário ou senha incorretos",
          });
        }
      }

      // 🛡️ se existe MAS não tem senha: não permitir “tomar conta” do usuário
      if (existing && !existing.passwordHash) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Este usuário ainda não tem senha definida. Peça ao admin/owner para definir ou resetar a senha.",
        });
      }

      // ✅ se não existe: cria com senha
      const passwordHash = existing ? undefined : hashPassword(input.password);

      await upsertUser({
        openId,
        name: input.name ?? existing?.name ?? null,
        email: input.email ?? existing?.email ?? null,
        loginMethod: "local",
        passwordHash,
        lastSignedIn: now,
      } as any);

      // ✅ alinhar duração do token com cookie (30 dias)
      const maxAgeSeconds = 60 * 60 * 24 * 30;
      const token = await sdk.createSessionToken(openId, {
        expiresInMs: maxAgeSeconds * 1000,
      });

      ctx.res.setHeader("Set-Cookie", buildCookie(cookieName, token, maxAgeSeconds));
      return { success: true };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const cookieName = ENV.sessionCookieName || "app_session_id";
    ctx.res.setHeader("Set-Cookie", clearCookie(cookieName));
    return { success: true };
  }),

  me: protectedProcedure.query(({ ctx }) => {
    return { user: ctx.user };
  }),
});
