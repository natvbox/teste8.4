// server/_core/env.ts
import "dotenv/config";

function required(
  name: string,
  value: string | undefined | null,
  { fatal }: { fatal: boolean }
) {
  if (!value) {
    const msg = `[ENV] ${fatal ? "❌" : "⚠️"} ${name} não está definido.`;
    if (fatal) console.error(msg);
    else console.warn(msg);
  }
  return value ?? "";
}

function normalizeUrl(u: string) {
  const t = (u || "").trim();
  return t.replace(/\/$/, ""); // remove trailing slash
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

// ✅ Fonte única para o cookie de sessão
// - preferir COOKIE_SECRET
// - fallback: JWT_SECRET (compat)
const cookieSecret = (process.env.COOKIE_SECRET || process.env.JWT_SECRET || "").trim();

// ✅ JWT secret (preferível explícito; fallback cookieSecret pra compat)
const jwtSecret = (process.env.JWT_SECRET || cookieSecret || "").trim();

// ✅ URL normalizada
const appUrl = normalizeUrl(process.env.APP_URL || "");

// ✅ Cookie name normalizado
const sessionCookieName = (process.env.SESSION_COOKIE_NAME || "app_session_id").trim();

export const ENV = {
  // Runtime
  nodeEnv,
  isProduction,
  port: parseInt(process.env.PORT || "10000", 10),
  host: process.env.HOST || "0.0.0.0",

  // App
  appId: process.env.APP_ID || process.env.VITE_APP_ID || "notifique-me",
  appUrl,

  // Segurança
  cookieSecret,
  jwtSecret,

  // Banco
  databaseUrl: (process.env.DATABASE_URL || "").trim(),

  // Cookie name (fonte única)
  sessionCookieName,

  // Bootstrap owner
  ownerOpenId: (process.env.OWNER_OPEN_ID || "").trim(),
  ownerPassword: (process.env.OWNER_PASSWORD || "").trim(),

  // OAuth (opcional)
  oAuthServerUrl: (process.env.OAUTH_SERVER_URL || "").trim(),

  // Forge (opcional)
  forgeApiUrl: (process.env.BUILT_IN_FORGE_API_URL || "").trim(),
  forgeApiKey: (process.env.BUILT_IN_FORGE_API_KEY || "").trim(),

  // ✅ ALIASES para compatibilidade com código antigo
  COOKIE_SECRET: cookieSecret,
  APP_URL: appUrl,
} as const;

// ==============================
// LOG EM DESENVOLVIMENTO
// ==============================
if (!ENV.isProduction) {
  console.log("[ENV] Configuração carregada:");
  console.log("  - nodeEnv:", ENV.nodeEnv);
  console.log("  - appId:", ENV.appId);
  console.log("  - port:", ENV.port);
  console.log("  - host:", ENV.host);
  console.log("  - databaseUrl:", ENV.databaseUrl ? "(definido)" : "(não definido)");
  console.log("  - ownerOpenId:", ENV.ownerOpenId || "(não definido)");
  console.log("  - oAuthServerUrl:", ENV.oAuthServerUrl ? "(definido)" : "(não definido)");
  console.log("  - sessionCookieName:", ENV.sessionCookieName);
  console.log("  - appUrl:", ENV.appUrl || "(não definido)");
}

// ==============================
// VALIDAÇÕES CRÍTICAS
// ==============================
required("DATABASE_URL", ENV.databaseUrl, { fatal: ENV.isProduction });

// Em produção, exija segredos
required("COOKIE_SECRET (ou JWT_SECRET)", ENV.cookieSecret, { fatal: ENV.isProduction });
required("JWT_SECRET (recomendado explícito)", ENV.jwtSecret, { fatal: ENV.isProduction });

// OWNER é opcional
required("OWNER_OPEN_ID", ENV.ownerOpenId, { fatal: false });
