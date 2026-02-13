import { z } from "zod";
import { router, protectedProcedure, ownerProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { tenants, users, deliveries, userGroups, groups } from "../../drizzle/schema";
import { eq, sql, count, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { isValidLoginIdOrEmail, isValidPassword, hashPassword } from "../_core/password";

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

/**
 * Regra do painel Admin (decisão A):
 * - Admin gerencia TODOS os usuários do seu tenant (não depende de createdByAdminId)
 * - Owner não gerencia users por aqui (usa superadmin)
 */
function requireTenantAdmin(ctx: any) {
  if (ctx.user?.role === "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Owner não usa tenantRouter para users (use superadmin)",
    });
  }
  const tenantId = ctx.user?.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });
  }
  return tenantId as number;
}

export const tenantRouter = router({
  /**
   * Obter informações de assinatura do usuário atual
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

    // OWNER: visão global
    if (ctx.user?.role === "owner") {
      return {
        id: 0,
        name: "Administrador do Sistema (Owner)",
        slug: "owner",
        status: "active" as const,
        plan: "enterprise" as const,
        subscriptionExpiresAt: null,
        isExpired: false,
        daysRemaining: 9999,
        isSuperAdmin: true,
        isOwner: true,
      };
    }

    // ADMIN: dados do tenant
    if (ctx.user?.role === "admin" && ctx.user?.tenantId) {
      const result = await db.select().from(tenants).where(eq(tenants.id, ctx.user.tenantId)).limit(1);
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });

      const tenant = result[0];
      const now = new Date();
      const expiresAt = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : null;
      const isExpired = expiresAt ? expiresAt < now : false;
      const daysRemaining = expiresAt
        ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        subscriptionExpiresAt: tenant.subscriptionExpiresAt,
        isExpired,
        daysRemaining: Math.max(0, daysRemaining),
        isSuperAdmin: false,
        isOwner: false,
      };
    }

    // USER comum: vê tenant básico se tiver
    if (ctx.user?.tenantId) {
      const result = await db.select().from(tenants).where(eq(tenants.id, ctx.user.tenantId)).limit(1);
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });

      const tenant = result[0];
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
        subscriptionExpiresAt: null, // user comum não vê expiração
        isExpired: false,
        daysRemaining: 0,
        isSuperAdmin: false,
        isOwner: false,
      };
    }

    // sem tenant
    return {
      id: 0,
      name: "Sem Tenant",
      slug: "",
      status: "active" as const,
      plan: "basic" as const,
      subscriptionExpiresAt: null,
      isExpired: false,
      daysRemaining: 0,
      isSuperAdmin: false,
      isOwner: false,
    };
  }),

  /**
   * Listar todos os tenants (apenas Owner)
   */
  listTenants: ownerProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return await db.select().from(tenants).orderBy(sql`${tenants.createdAt} DESC`);
  }),

  /**
   * Criar novo tenant (apenas Owner)
   */
  createTenant: ownerProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        slug: z.string().min(1, "Slug é obrigatório"),
        plan: z.enum(["basic", "pro", "enterprise"]),
        months: z.number().min(1).default(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const slug = normalizeSlug(input.slug);
      if (!slug) throw new TRPCError({ code: "BAD_REQUEST", message: "Slug inválido" });

      const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Slug já existe" });

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + input.months);

      const result = await db
        .insert(tenants)
        .values({
          name: input.name,
          slug,
          plan: input.plan,
          subscriptionExpiresAt: expiresAt,
          status: "active",
        })
        .returning({ id: tenants.id });

      return { success: true, tenantId: result[0]?.id || 0 };
    }),

  /**
   * Renovar assinatura (Owner)
   */
  renewSubscription: ownerProcedure
    .input(
      z.object({
        tenantId: z.number().positive("ID do tenant deve ser positivo"),
        months: z.number().positive("Número de meses deve ser positivo"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const result = await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });

      const tenant = result[0];
      const currentExpiry = tenant.subscriptionExpiresAt ? new Date(tenant.subscriptionExpiresAt) : new Date();
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(baseDate);
      newExpiry.setMonth(newExpiry.getMonth() + input.months);

      await db
        .update(tenants)
        .set({ subscriptionExpiresAt: newExpiry, status: "active", updatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId));

      return { success: true, newExpiry };
    }),

  /**
   * Atualizar tenant (Owner)
   */
  updateTenant: ownerProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        status: z.enum(["active", "suspended", "expired"]).optional(),
        plan: z.enum(["basic", "pro", "enterprise"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.status) updateData.status = input.status;
      if (input.plan) updateData.plan = input.plan;

      await db.update(tenants).set(updateData).where(eq(tenants.id, input.id));
      return { success: true };
    }),

  /**
   * Deletar tenant (Owner)
   */
  deleteTenant: ownerProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      await db.update(users).set({ tenantId: null, updatedAt: new Date() }).where(eq(users.tenantId, input));
      await db.delete(tenants).where(eq(tenants.id, input));

      return { success: true };
    }),

  /**
   * Admin pode ver seu próprio tenant
   */
  getMyTenant: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

    // Owner não tem tenant específico (adminProcedure aceita owner também)
    if (ctx.user?.role === "owner") {
      return {
        id: 0,
        name: "Sistema (Owner)",
        slug: "system",
        status: "active" as const,
        plan: "enterprise" as const,
        subscriptionExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ownerId: null,
      };
    }

    if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Admin sem tenant" });

    const result = await db.select().from(tenants).where(eq(tenants.id, ctx.user.tenantId)).limit(1);
    if (result.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });

    return result[0];
  }),

  /**
   * Admin pode ver usuários do seu tenant (DECISÃO A)
   * - Owner não lista por aqui
   */
  listMyUsers: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const tenantId = requireTenantAdmin(ctx);

    return await db
      .select()
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .orderBy(sql`${users.createdAt} DESC`);
  }),

  /**
   * Stats do tenant
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { users: 0, notifications: 0, groups: 0 };

    try {
      if (ctx.user?.role === "owner") {
        const [userCount] = await db.select({ value: count() }).from(users);
        return { users: userCount?.value || 0, notifications: 0, groups: 0 };
      }

      if (!ctx.user?.tenantId) return { users: 0, notifications: 0, groups: 0 };

      const [userCount] = await db
        .select({ value: count() })
        .from(users)
        .where(eq(users.tenantId, ctx.user.tenantId));

      return { users: userCount?.value || 0, notifications: 0, groups: 0 };
    } catch (error) {
      console.error("[Tenant] Erro ao obter stats:", error);
      return { users: 0, notifications: 0, groups: 0 };
    }
  }),

  /**
   * ADMIN: criar usuário comum (role=user) no seu tenant
   */
  createUser: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        loginId: z.string().min(3).max(64),
        password: z.string().min(4).max(128),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const tenantId = requireTenantAdmin(ctx);
      const adminId = ctx.user.id;

      const openId = input.loginId.trim().toLowerCase();

      if (!isValidLoginIdOrEmail(openId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Usuário inválido. Use um login (letras/números e ; . _ -) ou um e-mail válido",
        });
      }
      if (!isValidPassword(input.password)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Senha inválida. Use apenas letras, números e ; . _ -",
        });
      }

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Usuário já existe" });

      const created = await db
        .insert(users)
        .values({
          tenantId,
          createdByAdminId: adminId, // auditoria
          openId,
          name: input.name,
          email: input.email ? input.email.trim().toLowerCase() : null,
          role: "user",
          loginMethod: "local",
          passwordHash: hashPassword(input.password),
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        } as any)
        .returning();

      return { success: true, user: created[0] };
    }),

  /**
   * ADMIN: atualizar usuário do tenant (DECISÃO A: qualquer role=user do tenant)
   */
  updateUser: adminProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        email: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const tenantId = requireTenantAdmin(ctx);

      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.id), eq(users.tenantId, tenantId), eq(users.role, "user")))
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });

      const patch: any = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();

      const updated = await db.update(users).set(patch).where(eq(users.id, input.id)).returning();
      return { success: true, user: updated[0] };
    }),

  /**
   * ADMIN: remover usuário comum do tenant (DECISÃO A: qualquer role=user do tenant)
   */
  deleteUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const tenantId = requireTenantAdmin(ctx);

      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.id), eq(users.tenantId, tenantId), eq(users.role, "user")))
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });

      await db.delete(userGroups).where(eq(userGroups.userId, input.id));
      await db.delete(deliveries).where(eq(deliveries.userId, input.id));
      await db.delete(users).where(eq(users.id, input.id));

      return { success: true };
    }),

  /**
   * ADMIN: listar grupos do usuário (para modal "Grupos" no Users)
   */
  getUserGroups: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { groupIds: [] as number[] };

      const tenantId = requireTenantAdmin(ctx);
      const adminId = ctx.user.id;

      // valida user no tenant e role=user
      const u = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.id), eq(users.tenantId, tenantId), eq(users.role, "user")))
        .limit(1);

      if (!u.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });

      // pega grupos do user, mas só retorna grupos que pertencem ao tenant do admin E criados pelo admin (mesma regra do groupsRouter)
      const rows = await db
        .select({ groupId: userGroups.groupId })
        .from(userGroups)
        .innerJoin(groups, eq(groups.id, userGroups.groupId))
        .where(
          and(
            eq(userGroups.userId, input.id),
            eq(groups.tenantId, tenantId),
            eq(groups.createdByAdminId, adminId)
          )
        );

      return { groupIds: rows.map((r) => r.groupId) };
    }),

  /**
   * ADMIN: setar grupos do usuário (para modal "Grupos" no Users)
   */
  setUserGroups: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        groupIds: z.array(z.number()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const tenantId = requireTenantAdmin(ctx);
      const adminId = ctx.user.id;

      // valida user no tenant e role=user
      const u = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.userId), eq(users.tenantId, tenantId), eq(users.role, "user")))
        .limit(1);

      if (!u.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });

      // valida grupos do tenant do admin e criados pelo admin (igual groupsRouter)
      if (input.groupIds.length) {
        const validGroups = await db
          .select({ id: groups.id })
          .from(groups)
          .where(
            and(
              eq(groups.tenantId, tenantId),
              eq(groups.createdByAdminId, adminId),
              inArray(groups.id, input.groupIds)
            )
          );

        const validIds = new Set(validGroups.map((g) => g.id));
        const bad = input.groupIds.filter((id) => !validIds.has(id));
        if (bad.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Grupos inválidos" });
      }

      await db.transaction(async (tx) => {
        await tx.delete(userGroups).where(eq(userGroups.userId, input.userId));

        if (input.groupIds.length) {
          await tx.insert(userGroups).values(
            input.groupIds.map((groupId) => ({
              userId: input.userId,
              groupId,
              createdAt: new Date(),
            }))
          );
        }
      });

      return { success: true };
    }),

  /**
   * ADMIN: resetar senha de usuário do tenant (role=user)
   */
  resetUserPassword: adminProcedure
    .input(
      z.object({
        id: z.number(),
        password: z.string().min(4).max(128),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const tenantId = requireTenantAdmin(ctx);

      if (!isValidPassword(input.password)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Senha inválida. Use apenas letras, números e ; . _ -",
        });
      }

      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, input.id), eq(users.tenantId, tenantId), eq(users.role, "user")))
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });

      await db
        .update(users)
        .set({
          passwordHash: hashPassword(input.password),
          loginMethod: "local",
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, input.id));

      return { success: true };
    }),
});
