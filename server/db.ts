import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { ensureSchema } from "./_core/ensureSchema";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, {
        ssl: { rejectUnauthorized: false },
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });

      _db = drizzle(_client);
      console.log("[Database] ✅ Conexão estabelecida com sucesso");

      // ✅ Garantir schema/tabelas/colunas necessárias (SEM apagar dados)
      try {
        await ensureSchema(_db);
        console.log("[Database] ✅ Schema verificado/ajustado com sucesso");
      } catch (schemaErr) {
        console.error(
          "[Database] ⚠️ Falha ao garantir schema (continuando):",
          schemaErr
        );
      }
    } catch (error) {
      console.error("[Database] ❌ Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Função para verificar se é o owner do sistema
function isSystemOwner(openId: string): boolean {
  const ownerOpenId = ENV.ownerOpenId || process.env.OWNER_OPEN_ID;
  if (!ownerOpenId) return false;
  return openId.toLowerCase() === ownerOpenId.toLowerCase();
}

/**
 * ✅ Tipo seguro: SOMENTE colunas reais do update do users
 * (evita criar set com chave "undefined" ou qualquer lixo)
 */
type UpsertUserUpdateSet = Partial<{
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  passwordHash: string | null;
  lastSignedIn: Date;
  role: "user" | "admin" | "owner";
  tenantId: number | null;
  createdByAdminId: number | null;
}>;

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const isOwner = isSystemOwner(user.openId);

    // ✅ values: só colunas reais
    const values: Partial<InsertUser> = {
      openId: user.openId,
    };

    // ✅ updateSet: só colunas reais (TIPADO)
    const updateSet: UpsertUserUpdateSet = {};

    const textFields = ["name", "email", "loginMethod", "passwordHash"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;

      const normalized = (value ?? null) as string | null;
      (values as any)[field] = normalized;
      (updateSet as any)[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }

    // Definir role baseado no OWNER_OPEN_ID
    if (isOwner) {
      values.role = "owner";
      updateSet.role = "owner";

      values.tenantId = null; // Owner não tem tenant
      updateSet.tenantId = null;

      values.createdByAdminId = null;
      updateSet.createdByAdminId = null;

      console.log(
        `[Database] 👑 Usuário ${user.openId} identificado como OWNER do sistema`
      );
    } else if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role as any;
    }

    // Manter tenantId se fornecido (para admins e users)
    if (user.tenantId !== undefined && !isOwner) {
      values.tenantId = user.tenantId as any;
      updateSet.tenantId = user.tenantId as any;
    }

    // Manter createdByAdminId se fornecido (para users criados por admin)
    if (user.createdByAdminId !== undefined && !isOwner) {
      values.createdByAdminId = user.createdByAdminId as any;
      updateSet.createdByAdminId = user.createdByAdminId as any;
    }

    // Garantir lastSignedIn
    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (!updateSet.lastSignedIn) {
      updateSet.lastSignedIn = values.lastSignedIn;
    }

    // 🛡️ TRAVA EXTRA: nunca permitir chave "undefined"
    // (caso algum lugar gere obj[undefined] = ...)
    delete (updateSet as any)["undefined"];
    delete (values as any)["undefined"];

    await db
      .insert(users)
      .values(values as any)
      .onConflictDoUpdate({
        target: users.openId,
        set: updateSet as any,
      });

    console.log(
      `[Database] ✅ Usuário ${user.openId} upserted com role: ${
        (values as any).role || "user"
      }`
    );
  } catch (error) {
    console.error("[Database] ❌ Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return undefined;
  }

  let retries = 3;
  while (retries > 0) {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.openId, openId))
        .limit(1);

      return result.length > 0 ? result[0] : undefined;
    } catch (error) {
      retries--;
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        console.error("[Database] ❌ Failed to get user after retries:", error);
        return undefined;
      }
    }
  }
}

// Função para atualizar role de um usuário
export async function updateUserRole(
  userId: number,
  role: "user" | "admin" | "owner",
  tenantId?: number | null
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const updateData: Record<string, unknown> = { role };
  if (tenantId !== undefined) {
    updateData.tenantId = tenantId;
  }

  await db.update(users).set(updateData).where(eq(users.id, userId));
}

// Função para executar SQL raw (para migrations)
export async function executeRawSQL(sqlQuery: string) {
  if (!_client) {
    await getDb();
  }
  if (!_client) {
    throw new Error("Database client not available");
  }
  return await _client.unsafe(sqlQuery);
}
