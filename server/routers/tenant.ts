import { z } from "zod";
import { router, protectedProcedure, ownerProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { tenants, users, deliveries, userGroups } from "../../drizzle/schema";
import { eq, sql, count, and } from "drizzle-orm";
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
   * (Você já tem rotas no superadmin, mas manter aqui ok)
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
   * Admin pode ver seus usuários (filtrado por tenant)
   */
  listMyUsers: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    // Owner pode ver todos
    if (ctx.user?.role === "owner") {
      return await db.select().from(users).orderBy(sql`${users.createdAt} DESC`);
    }

    if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Admin sem tenant" });

    return await db.select().from(users).where(eq(users.tenantId, ctx.user.tenantId));
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

      if (ctx.user?.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner não cria user por aqui (use superadmin)" });
      }

      if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });

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
          tenantId: ctx.user.tenantId,
          createdByAdminId: ctx.user.id,
          openId,
          name: input.name,
          email: input.email ? input.email.trim().toLowerCase() : null,
          role: "user",
          loginMethod: "local",
          passwordHash: hashPassword(input.password),
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        })
        .returning();

      return { success: true, user: created[0] };
    }),

  /**
   * ADMIN: atualizar usuário do seu tenant (somente os criados por você)
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

      if (ctx.user?.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner não atualiza user por aqui (use superadmin)" });
      }

      if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });

      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.id),
            eq(users.tenantId, ctx.user.tenantId),
            eq(users.role, "user"),
            eq(users.createdByAdminId, ctx.user.id)
          )
        )
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });

      const patch: any = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;

      if (input.email !== undefined) {
        patch.email = input.email.trim().toLowerCase();
      }

      const updated = await db.update(users).set(patch).where(eq(users.id, input.id)).returning();
      return { success: true, user: updated[0] };
    }),

  /**
   * ADMIN: remover usuário comum do seu tenant (somente os criados por você)
   */
  deleteUser: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      if (ctx.user?.role === "owner") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Owner não remove user por aqui (use superadmin)" });
      }

      if (!ctx.user?.tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });

      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, input.id),
            eq(users.tenantId, ctx.user.tenantId),
            eq(users.role, "user"),
            eq(users.createdByAdminId, ctx.user.id)
          )
        )
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado" });

      await db.delete(userGroups).where(eq(userGroups.userId, input.id));
      await db.delete(deliveries).where(eq(deliveries.userId, input.id));
      await db.delete(users).where(eq(users.id, input.id));

      return { success: true };
    }),
});
