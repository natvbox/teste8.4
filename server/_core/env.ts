// server/_core/env.ts
import "dotenv/config";

function required(name: string, value: string, { fatal }: { fatal: boolean }) {
  if (!value) {
    const msg = `[ENV] ${fatal ? "❌" : "⚠️"} ${name} não está definido.`;
    if (fatal) {
      console.error(msg);
    } else {
      console.warn(msg);
    }
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";

// ✅ Fonte única para o cookie de sessão (padrão: COOKIE_SECRET, fallback: JWT_SECRET)
const cookieSecret =
  process.env.COOKIE_SECRET ||
  process.env.JWT_SECRET ||
  "";

export const ENV = {
  // Runtime
  nodeEnv,
  isProduction,
  port: parseInt(process.env.PORT || "10000", 10),
  host: process.env.HOST || "0.0.0.0",

  // App
  appId: process.env.APP_ID || process.env.VITE_APP_ID || "notifique-me",

  // URLs (opcional)
  appUrl: process.env.APP_URL || "",

  // Segurança
  cookieSecret,
  jwtSecret: process.env.JWT_SECRET || cookieSecret, // mantém compat

  // Banco
  databaseUrl: process.env.DATABASE_URL || "",

  // Cookie name (padroniza)
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "app_session_id",

  // Bootstrap owner
  ownerOpenId: process.env.OWNER_OPEN_ID || "",
  ownerPassword: process.env.OWNER_PASSWORD || "",

  // OAuth (opcional)
  oAuthServerUrl: process.env.OAUTH_SERVER_URL || "",

  // Forge (opcional)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL || "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY || "",

  // ✅ ALIASES para compatibilidade com código antigo
  // (para não quebrar trechos que usam ENV.COOKIE_SECRET etc.)
  COOKIE_SECRET: cookieSecret,
  APP_URL: process.env.APP_URL || "",
} as const;

// ==============================
// LOG EM DESENVOLVIMENTO
// ==============================
if (!ENV.isProduction) {
  console.log("[ENV] Configuração carregada:");
  console.log("  - nodeEnv:", ENV.nodeEnv);
  console.log("  - appId:", ENV.appId);
  console.log("  - port:", ENV.port);
  console.log("  - databaseUrl:", ENV.databaseUrl ? "(definido)" : "(não definido)");
  console.log("  - ownerOpenId:", ENV.ownerOpenId || "(não definido)");
  console.log("  - oAuthServerUrl:", ENV.oAuthServerUrl ? "(definido)" : "(não definido)");
}

// ==============================
// VALIDAÇÕES CRÍTICAS
// ==============================

// Em produção, falha rápido.
required("DATABASE_URL", ENV.databaseUrl, { fatal: ENV.isProduction });
required("COOKIE_SECRET (ou JWT_SECRET)", ENV.cookieSecret, { fatal: ENV.isProduction });

// OWNER é opcional
required("OWNER_OPEN_ID", ENV.ownerOpenId, { fatal: false });
