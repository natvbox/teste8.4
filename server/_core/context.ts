import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;

  // ✅ Ajuda debug/consistência (sem expor segredo)
  sessionCookieName: string;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Otimização: se não tem header cookie, nem tenta autenticar
  const hasCookieHeader = Boolean(opts.req.headers.cookie);

  if (hasCookieHeader) {
    try {
      // ✅ O SDK deve usar ENV.sessionCookieName internamente para ler o cookie correto.
      // Aqui mantemos o fluxo e evitamos quebrar compatibilidade.
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      user = null;

      // Log só em dev (não polui produção)
      if (!ENV.isProduction) {
        console.warn("[Auth] Context auth failed:", {
          message: String(error),
          hasCookieHeader: true,
          sessionCookieName: ENV.sessionCookieName,
        });
      }
    }
  } else {
    if (!ENV.isProduction) {
      // útil para entender requests sem cookie (assets, healthchecks, first load)
      // sem poluir demais
      // console.debug("[Auth] No cookie header on request");
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    sessionCookieName: ENV.sessionCookieName,
  };
}
