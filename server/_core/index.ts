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

  /* ============================
     CORS
  ============================ */
  app.use(
    cors({
      origin: (origin, callback) => {
        // Permite chamadas sem origin (ex: curl, mobile apps)
        if (!origin) return callback(null, true);

        // Permite o próprio domínio
        // OBS: se ENV.APP_URL estiver vazio, isso pode bloquear. Se der erro de CORS, ajustamos.
        if (origin.includes(ENV.APP_URL)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
    })
  );

  /* ============================
     Middlewares essenciais
  ============================ */
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(
    cookieParser(ENV.COOKIE_SECRET || "default-secret-change-in-production")
  );

  /* ============================
     tRPC
  ============================ */
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  /* ============================
     OAuth (se estiver usando)
  ============================ */
  registerOAuthRoutes(app);

  /* ============================
     FRONTEND ESTÁTICO (PROD)
     dist/public
  ============================ */
  const publicPath = path.join(__dirname, "public");

  // 1) Arquivos estáticos (css/js/images)
  app.use(express.static(publicPath));

  // 2) SPA fallback (somente para rotas do frontend)
  // - não pega /api
  // - não pega arquivos com extensão (assets)
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api")) return next();

    // Se tem extensão (.js, .css, .png etc), NÃO faz fallback
    if (req.path.includes(".")) return next();

    return res.sendFile(path.join(publicPath, "index.html"));
  });

  console.log("🚀 Frontend estático habilitado");
  console.log("📁 Caminho do frontend:", publicPath);

  /* ============================
     START SERVER
  ============================ */
  const PORT = Number(process.env.PORT) || 10000;

  server.listen(PORT, () => {
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
