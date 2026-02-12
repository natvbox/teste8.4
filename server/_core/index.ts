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
     (dist/public)
  ============================ */
  const publicPath = path.join(__dirname, "public");

  // ✅ Serve arquivos estáticos (css/js/images) corretamente
  app.use(express.static(publicPath));

  // ✅ SPA fallback (somente para rotas do frontend)
  // Não intercepta /api
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).end();
    }
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
