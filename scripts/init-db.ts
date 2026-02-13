import "dotenv/config";
import fs from "fs";
import path from "path";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { ENV } from "../server/_core/env";

/**
 * Script de inicialização do banco:
 * - cria tabelas (se necessário)
 * - roda SQL base
 * - garante usuário owner
 */

async function run() {
  if (!ENV.DATABASE_URL) {
    console.error("❌ DATABASE_URL não definida");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: ENV.DATABASE_URL,
    ssl:
      ENV.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  try {
    console.log("[Banco de dados] 🔄 Conectando...");

    const client = await pool.connect();

    console.log("[Banco de dados] ✅ Conectado");

    /**
     * 1️⃣ Criar tabelas via SQL (caso exista)
     */
    const sqlPath = path.resolve(
      process.cwd(),
      "scripts",
      "create-tables.sql"
    );

    if (fs.existsSync(sqlPath)) {
      console.log("[Banco de dados] 📄 Executando create-tables.sql...");

      const sql = fs.readFileSync(sqlPath, "utf-8");
      await client.query(sql);

      console.log("[Banco de dados] ✅ Estrutura criada/verificada");
    } else {
      console.log("[Banco de dados] ⚠️ create-tables.sql não encontrado");
    }

    /**
     * 2️⃣ Garantir usuário OWNER
     */
    if (!ENV.OWNER_OPEN_ID) {
      console.log("[Banco de dados] ⚠️ OWNER_OPEN_ID não definido");
    } else {
      const ownerLogin = ENV.OWNER_OPEN_ID;
      const ownerPassword =
        ENV.OWNER_PASSWORD || "admin123";

      const passwordHash = await bcrypt.hash(ownerPassword, 10);

      const check = await client.query(
        "SELECT id FROM users WHERE loginId = $1 LIMIT 1",
        [ownerLogin]
      );

      if (check.rows.length === 0) {
        await client.query(
          `
          INSERT INTO users (loginId, passwordHash, role, "createdAt")
          VALUES ($1, $2, 'owner', NOW())
          `,
          [ownerLogin, passwordHash]
        );

        console.log(
          `[Banco de dados] ✅ OWNER criado: ${ownerLogin}`
        );
      } else {
        console.log(
          `[Banco de dados] ✅ OWNER já existe: ${ownerLogin}`
        );
      }
    }

    client.release();
  } catch (error) {
    console.error("[Banco de dados] ❌ Erro:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
