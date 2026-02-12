import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Otimização: se não tem header cookie, nem tenta autenticar
  const hasCookieHeader = Boolean(opts.req.headers.cookie);

  if (hasCookieHeader) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      user = null;

      // Log só em dev (não polui produção)
      if (!ENV.isProduction) {
        console.warn("[Auth] Context auth failed:", String(error));
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
