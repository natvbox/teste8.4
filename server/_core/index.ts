import express from "express";
import { createServer } from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";

/* ============================
   FIX PARA __dirname EM ESM
============================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Necessário para cookies funcionarem atrás do proxy (Render)
  app.set("trust proxy", 1);

  // Em produção, não deixa subir sem segredos
  if (ENV.isProduction) {
    if (!ENV.cookieSecret) {
      console.error("[ENV] ❌ COOKIE_SECRET não definido em produção. Abortando.");
      process.exit(1);
    }
    if (!ENV.jwtSecret) {
      console.error("[ENV] ❌ JWT_SECRET não definido em produção. Abortando.");
      process.exit(1);
    }
  }

  /* ============================
     Middlewares essenciais
  ============================ */
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Cookie parser precisa do segredo correto
  app.use(cookieParser(ENV.cookieSecret || "dev-cookie-secret"));

  /* ============================
     CORS (APENAS PARA API)
     NÃO aplique CORS no site inteiro,
     senão quebra /assets e até o próprio frontend.
  ============================ */
  const appUrl = process.env.APP_URL || ""; // opcional (ex: https://seuapp.onrender.com)

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // sem origin (curl, apps) -> ok
      if (!origin) return callback(null, true);

      // Permite localhost dev
      if (origin.startsWith("http://localhost")) return callback(null, true);

      // Permite qualquer onrender.com (útil pra preview/ambientes)
      if (origin.includes(".onrender.com")) return callback(null, true);

      // Permite o domínio configurado (se existir)
      if (appUrl && origin === appUrl) return callback(null, true);

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  };

  /* ============================
     tRPC (com CORS só aqui)
  ============================ */
  app.use(
    "/api/trpc",
    cors(corsOptions),
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  /* ============================
     OAuth (se estiver usando)
     (se ele expõe rotas /oauth, também precisa CORS)
  ============================ */
  app.use("/oauth", cors(corsOptions));
  registerOAuthRoutes(app);

  /* ============================
     FRONTEND ESTÁTICO (dist/public)
  ============================ */
  const publicPath = path.join(__dirname, "public");

  // Arquivos estáticos SEM CORS
  app.use(express.static(publicPath));

  // SPA fallback (somente para rotas do frontend)
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api")) return next();
    if (req.path.includes(".")) return next(); // .js .css .png etc

    return res.sendFile(path.join(publicPath, "index.html"));
  });

  console.log("🚀 Frontend estático habilitado");
  console.log("📁 Caminho do frontend:", publicPath);

  /* ============================
     START SERVER
  ============================ */
  const PORT = ENV.port;

  server.listen(PORT, ENV.host, () => {
    console.log("========================================");
    console.log("✅ Servidor rodando");
    console.log("🌐 Porta:", PORT);
    console.log("========================================");
  });
}

startServer().catch((err) => {
  console.error("❌ Erro ao iniciar servidor:", err);
  process.exit(1);
});
