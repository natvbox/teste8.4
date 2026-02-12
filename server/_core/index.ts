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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Render/Proxy (cookies secure + IP real)
  app.set("trust proxy", 1);

  // CORS (precisa permitir credentials)
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  // Cookies (sessão)
  app.use(cookieParser());

  // Healthcheck
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  /**
   * ✅ MUITO IMPORTANTE:
   * JSON parser ANTES do tRPC.
   * Em alguns proxies o Content-Type pode vir como text/plain,
   * e sem isso o input chega undefined (Zod -> "expected object, received undefined").
   */
  app.use(
    express.json({
      limit: "2mb",
      type: ["application/json", "application/*+json", "text/plain", "*/*"],
    })
  );
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // Debug controlado (não imprime senha)
  app.use("/api/trpc", (req, _res, next) => {
    if (req.method === "POST" && String(req.url).includes("auth.login")) {
      const body: any = (req as any).body;
      const keys = body && typeof body === "object" ? Object.keys(body) : null;

      const safePreview =
        body && typeof body === "object"
          ? {
              keys,
              hasBatch0: Boolean((body as any)[0] || (body as any)["0"]),
              hasJson0: Boolean((body as any)[0]?.json || (body as any)["0"]?.json),
              hasLoginId:
                Boolean((body as any)?.loginId) ||
                Boolean((body as any)[0]?.json?.loginId) ||
                Boolean((body as any)["0"]?.json?.loginId),
            }
          : { keys: null };

      console.log("[tRPC][auth.login] body preview:", safePreview);
    }
    next();
  });

  // tRPC
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // OAuth (se você usa; se não usar, pode manter sem problemas)
  registerOAuthRoutes(app);

  const isProd = process.env.NODE_ENV === "production";

  if (!isProd) {
    // DEV: Vite middleware
    await setupVite(app, server);
  } else {
    // PROD: servir o build do client
    // (seu build do vite está saindo em dist/public)
    const frontendPath = path.resolve(process.cwd(), "dist", "public");

    console.log("🚀 PROD: frontend estático");
    console.log("📁 Frontend path:", frontendPath);

    app.use(express.static(frontendPath));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendPath, "index.html"));
    });
  }

  const port = Number(process.env.PORT || 10000);

  server.listen(port, "0.0.0.0", () => {
    console.log("========================================");
    console.log("✅ Servidor rodando");
    console.log("🌐 Porta:", port);
    console.log("========================================");
  });
}

startServer().catch((err) => {
  console.error("❌ Erro fatal ao iniciar servidor:", err);
  process.exit(1);
});
