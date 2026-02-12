import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { setupVite } from "./vite";

/* ============================
   ✅ FIX PARA __dirname EM ESM
============================ */
const __filename = fileURLToPath(import.meta.url );
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ✅ CORS precisa vir antes (cookies + credentials)
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );

  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // 🚨 OBRIGATÓRIO: JSON parser ANTES do tRPC (inclui batch)
  // Em alguns ambientes/proxies o Content-Type pode vir como text/plain.
  // Se o Express não parseia, o input do tRPC chega como undefined e o Zod acusa:
  // "Invalid input: expected object, received undefined".
  // Então aceitamos JSON mesmo quando o Content-Type não é application/json.
  app.use(
    express.json({
      limit: "2mb",
      type: ["application/json", "application/*+json", "text/plain", "*/*"],
    })
  );
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // 🔎 DEBUG CONTROLADO (Render logs): ajuda a ver quando o body chega vazio
  // (não imprime senha)
  app.use("/api/trpc", (req, _res, next) => {
    if (req.method === "POST" && String(req.url).includes("auth.login")) {
      const body: any = (req as any).body;
      const keys = body && typeof body === "object" ? Object.keys(body) : null;
      const safePreview =
        body && typeof body === "object"
          ? {
              keys,
              // batch do tRPC costuma vir como {"0": { json: {...} } }
              hasBatch0: Boolean((body as any)[0] || (body as any)["0"]),
@@ -87,26 +91,25 @@ async function startServer() {
    const frontendPath = path.resolve(__dirname, "./public");

    console.log("📁 Frontend path:", frontendPath);

    app.use(express.static(frontendPath));

    app.get("*", (_req, res) => {
      res.sendFile(path.join(frontendPath, "index.html"));
    });
  }

  const port = Number(process.env.PORT || 3000);

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
