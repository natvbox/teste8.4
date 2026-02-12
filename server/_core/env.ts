// server/_core/env.ts
import "dotenv/config";

// ==============================
// ENV CENTRALIZADO E SEGURO
// ==============================

export const ENV = {
  // Runtime
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",

  port: parseInt(process.env.PORT || "10000", 10),
  host: process.env.HOST || "0.0.0.0",

  // App
  appId: process.env.APP_ID || "notifique-me",

  // Segurança
  cookieSecret: process.env.COOKIE_SECRET || "",
  jwtSecret: process.env.JWT_SECRET || "",

  // Banco
  databaseUrl: process.env.DATABASE_URL || "",

  // Bootstrap owner
  ownerOpenId: process.env.OWNER_OPEN_ID || "",
  ownerPassword: process.env.OWNER_PASSWORD || "",

  // OAuth (opcional)
  oAuthServerUrl: process.env.OAUTH_SERVER_URL || "",

  // Forge (se estiver usando)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL || "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY || "",
};

// ==============================
// LOG EM DESENVOLVIMENTO
// ==============================

if (!ENV.isProduction) {
  console.log("[ENV] Configuração carregada:");
  console.log("  - appId:", ENV.appId);
  console.log("  - databaseUrl:", ENV.databaseUrl ? "(definido)" : "(não definido)");
  console.log("  - ownerOpenId:", ENV.ownerOpenId || "(não definido)");
  console.log("  - isProduction:", ENV.isProduction);
}

// ==============================
// VALIDAÇÕES CRÍTICAS
// ==============================

if (!ENV.databaseUrl) {
  console.error("[ENV] ❌ DATABASE_URL não está definido.");
}

if (!ENV.cookieSecret) {
  console.error("[ENV] ❌ COOKIE_SECRET não está definido.");
}

if (!ENV.jwtSecret) {
  console.error("[ENV] ❌ JWT_SECRET não está definido.");
}

if (!ENV.ownerOpenId) {
  console.warn("[ENV] ⚠️ OWNER_OPEN_ID não está definido. Nenhum usuário será owner.");
}
