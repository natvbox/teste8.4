// Variáveis de ambiente do servidor
export const ENV = {
  appId: process.env.VITE_APP_ID ?? "notifique-me",
  cookieSecret: process.env.JWT_SECRET ?? "default-secret-for-development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
};

// Log de configuração (apenas em desenvolvimento)
if (!ENV.isProduction) {
  console.log("[ENV] Configuração carregada:");
  console.log("  - appId:", ENV.appId);
  console.log("  - ownerOpenId:", ENV.ownerOpenId || "(não definido)");
  console.log("  - databaseUrl:", ENV.databaseUrl ? "(definido)" : "(não definido)");
  console.log("  - isProduction:", ENV.isProduction);
}

// Validações críticas
if (!ENV.databaseUrl) {
  console.warn("[ENV] ⚠️ DATABASE_URL não está definido. O banco de dados não funcionará.");
}

if (!ENV.ownerOpenId) {
  console.warn("[ENV] ⚠️ OWNER_OPEN_ID não está definido. Nenhum usuário será owner.");
}
