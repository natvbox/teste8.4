import "dotenv/config";

function requireEnv(name: string, fallback?: string): string {
  const val = process.env[name] ?? fallback;
  if (!val) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
    }
    return "";
  }
  return val;
}

export const ENV = {
  /* ============================
     🧠 APP
  ============================ */
  APP_ID: process.env.APP_ID || "notifique-me",

  /* ============================
     🔐 AUTH
  ============================ */
  SESSION_SECRET: requireEnv("SESSION_SECRET", "dev-secret"),
  COOKIE_NAME: process.env.COOKIE_NAME || "notifique_me_session",

  /* ============================
     🧾 OWNER DEFAULT
  ============================ */
  OWNER_OPEN_ID: process.env.OWNER_OPEN_ID || "admin_fabioneto",
  OWNER_PASSWORD: process.env.OWNER_PASSWORD || "",

  /* ============================
     🗄️ DATABASE
  ============================ */
  DATABASE_URL: requireEnv("DATABASE_URL"),

  /* ============================
     🌐 URL PÚBLICA (Render / Proxy)
     Ex: https://notifique-me-admin.onrender.com
  ============================ */
  PUBLIC_URL: process.env.PUBLIC_URL || "",

  /* ============================
     🌍 OAUTH (opcional)
  ============================ */
  OAUTH_SERVER_URL: process.env.OAUTH_SERVER_URL || "",
  OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID || "",
  OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET || "",

  /* ============================
     ☁️ AWS S3
     (NUNCA coloque no frontend)
  ============================ */
  AWS_REGION: process.env.AWS_REGION || "",
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET || "",
  AWS_S3_PUBLIC: process.env.AWS_S3_PUBLIC || "true",
  AWS_S3_PUBLIC_URL: process.env.AWS_S3_PUBLIC_URL || "",
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",

  /* ============================
     📦 STORAGE MODE
     local | s3
  ============================ */
  STORAGE_MODE: process.env.STORAGE_MODE || "local",

  /* ============================
     🚀 NODE
  ============================ */
  NODE_ENV: process.env.NODE_ENV || "development",
  IS_PRODUCTION: process.env.NODE_ENV === "production",
};

console.log("[ENV] Configuração carregada:");
console.log("  - appId:", ENV.APP_ID);
console.log("  - ownerOpenId:", ENV.OWNER_OPEN_ID);
console.log("  - databaseUrl:", ENV.DATABASE_URL ? "(definido)" : "(não definido)");
console.log("  - isProduction:", ENV.IS_PRODUCTION);
if (ENV.AWS_S3_BUCKET) {
  console.log("  - AWS S3:", ENV.AWS_S3_BUCKET, ENV.AWS_REGION);
} else {
  console.log("  - AWS S3: desativado");
}
