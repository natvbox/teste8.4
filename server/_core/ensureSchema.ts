import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export async function ensureSchema(db: PostgresJsDatabase<any>) {
  // Adiciona colunas sem quebrar dados
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS "createdByAdminId" integer;
  `);

  // ✅ Login com usuário + senha (hash). Não apaga dados.
  await db.execute(sql`
    ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS "passwordHash" text;
  `);

  await db.execute(sql`
    ALTER TABLE IF EXISTS groups
      ADD COLUMN IF NOT EXISTS "createdByAdminId" integer;
  `);

  await db.execute(sql`
    ALTER TABLE IF EXISTS deliveries
      ADD COLUMN IF NOT EXISTS "feedback" text,
      ADD COLUMN IF NOT EXISTS "feedbackAt" timestamp;
  `);

  // Índices básicos (performance/isolamento)
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_tenant_createdBy ON users("tenantId","createdByAdminId");`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_groups_tenant_createdBy ON groups("tenantId","createdByAdminId");`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_deliveries_user ON deliveries("userId","notificationId");`);
}
