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

function normalizeOrigin(origin: string) {
  // remove trailing slash
  return origin.replace(/\/$/, "");
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ✅ Necessário para cookies funcionarem atrás do proxy (Render)
  app.set("trust proxy", 1);

  // ✅ Healthcheck simples (Render / uptime monitors)
  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  // ✅ Em produção, não deixa subir sem segredos
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
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // ✅ Cookie parser
  app.use(cookieParser(ENV.cookieSecret || "dev-cookie-secret"));

  /* ============================
     CORS (APENAS PARA API)
  ============================ */

  const allowedOrigins = new Set<string>();

  // Dev
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://127.0.0.1:5173");
  allowedOrigins.add("http://127.0.0.1:3000");

  // Produção / domínio configurado (se existir)
  if (ENV.appUrl) allowedOrigins.add(normalizeOrigin(ENV.appUrl));

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Sem origin (curl, healthchecks) -> OK
      if (!origin) return callback(null, true);

      const o = normalizeOrigin(origin);

      // Permite qualquer onrender.com (preview / ambientes)
      if (o.includes(".onrender.com")) return callback(null, true);

      // Permite origins explicitamente listadas
      if (allowedOrigins.has(o)) return callback(null, true);

      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-trpc-batch",
      "x-trpc-source",
      "trpc-accept",
    ],
  };

  /* ============================
     tRPC (com CORS só aqui)
  ============================ */
  // ✅ preflight precisa cobrir /api/trpc e /api/trpc/*
  app.options("/api/trpc", cors(corsOptions));
  app.options("/api/trpc/*", cors(corsOptions));

  app.use(
    "/api/trpc",
    cors(corsOptions),
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  /* ============================
     OAuth (opcional)
  ============================ */
  if (ENV.oAuthServerUrl) {
    app.use("/oauth", cors(corsOptions));
    registerOAuthRoutes(app);
  }

  /* ============================
     FRONTEND ESTÁTICO (dist/public)
  ============================ */
  const publicPath = path.join(__dirname, "public");

  // ✅ Arquivos estáticos SEM CORS
  app.use(express.static(publicPath));

  // ✅ SPA fallback (somente para rotas do frontend)
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api")) return next();
    if (req.path.startsWith("/oauth")) return next();
    if (req.path === "/healthz") return next();
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
    console.log("🌐 Host:", ENV.host);
    console.log("🌐 Porta:", PORT);
    console.log("========================================");
  });
}

startServer().catch((err) => {
  console.error("❌ Erro ao iniciar servidor:", err);
  process.exit(1);
});
