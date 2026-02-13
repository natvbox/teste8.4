import "dotenv/config";
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
import { setupVite } from "./vite";
import { ENV } from "./env";

/* ============================
   FIX para __dirname em ESM
============================ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // 🔐 necessário para cookies em proxy (Render)
  app.set("trust proxy", 1);

  /* ============================
     CORS (antes de tudo)
  ============================ */
  app.use(
    cors({
      origin: (origin, callback) => {
        // permite requisições sem origin (Postman, etc)
        if (!origin) return callback(null, true);

        if (ENV.PUBLIC_URL && origin === ENV.PUBLIC_URL) {
          return callback(null, true);
        }

        if (!ENV.IS_PRODUCTION) {
          return callback(null, true);
        }

        return callback(new Error("CORS bloqueado"));
      },
      credentials: true,
    })
  );

  /* ============================
     Middlewares
  ============================ */
  app.use(cookieParser());

  // ⚠️ CRÍTICO para o seu erro anterior:
  // garante parsing do body JSON antes do tRPC
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  /* ============================
     OAuth (opcional)
  ============================ */
  registerOAuthRoutes(app);

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
     Frontend (Vite dev ou build)
  ============================ */
  const publicDir = path.resolve(__dirname, "../../dist/public");

  if (!ENV.IS_PRODUCTION) {
    await setupVite(app, server);
  } else {
    app.use(express.static(publicDir));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(publicDir, "index.html"));
    });
  }

  /* ============================
     Start
  ============================ */
  const port = process.env.PORT || 10000;

  server.listen(port, () => {
    console.log("========================================");
    console.log("✅ Servidor rodando");
    console.log("🌐 Porta:", port);
    console.log("========================================");
  });
}

startServer();
