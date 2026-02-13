import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ENV } from "./_core/env";

let pool: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

/**
 * Conexão lazy com PostgreSQL
 * Evita múltiplas conexões no Render
 */
export async function getDb() {
  if (dbInstance) return dbInstance;

  if (!ENV.DATABASE_URL) {
    console.error("[Database] ❌ DATABASE_URL não definida");
    return null;
  }

  try {
    pool = new Pool({
      connectionString: ENV.DATABASE_URL,
      ssl:
        ENV.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Testa conexão
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    dbInstance = drizzle(pool);

    console.log("[Database] ✅ Conexão estabelecida com sucesso");

    return dbInstance;
  } catch (error) {
    console.error("[Database] ❌ Falha na conexão:", error);
    return null;
  }
}

/**
 * Encerrar pool (opcional, útil em jobs)
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    dbInstance = null;
  }
}
