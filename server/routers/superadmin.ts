import { z } from "zod";
import { router, ownerProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { tenants, users, notifications, groups } from "../../drizzle/schema";
import { eq, sql, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const superAdminRouter = router({
  /**
   * Estatísticas globais do sistema
   */
  getStats: ownerProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

    try {
      const [tenantCount] = await db.select({ value: count() }).from(tenants);
      const [userCount] = await db.select({ value: count() }).from(users);
      const [notifCount] = await db.select({ value: count() }).from(notifications);

      return {
        totalTenants: tenantCount?.value || 0,
        totalUsers: userCount?.value || 0,
        totalNotifications: notifCount?.value || 0,
      };
    } catch (error) {
      console.error("[SuperAdmin] Erro ao obter stats:", error);
      return {
        totalTenants: 0,
        totalUsers: 0,
        totalNotifications: 0,
      };
    }
  }),

  /**
   * Listar todos os tenants
   */
  listTenants: ownerProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select().from(tenants).orderBy(sql`${tenants.createdAt} DESC`);
    } catch (error) {
      console.error("[SuperAdmin] Erro ao listar tenants:", error);
      return [];
    }
  }),

  /**
   * Criar novo tenant
   */
  createTenant: ownerProcedure
    .input(z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      slug: z.string().min(1, "Slug é obrigatório"),
      plan: z.enum(["basic", "pro", "enterprise"]),
      months: z.number().min(1, "Mínimo 1 mês"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      // Verificar se slug já existe
      const existing = await db.select().from(tenants).where(eq(tenants.slug, input.slug.toLowerCase())).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Slug já existe. Escolha outro identificador." });
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + input.months);

      const result = await db.insert(tenants).values({
        name: input.name,
        slug: input.slug.toLowerCase().replace(/\s+/g, '-'),
        plan: input.plan,
        subscriptionExpiresAt: expiresAt,
        status: "active",
      }).returning({ id: tenants.id });

      return { success: true, tenantId: result[0]?.id || 0 };
    }),

  /**
   * Atualizar tenant
   */
  updateTenant: ownerProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      status: z.enum(["active", "suspended", "expired"]).optional(),
      plan: z.enum(["basic", "pro", "enterprise"]).optional(),
      months: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      
      if (input.name) updateData.name = input.name;
      if (input.status) updateData.status = input.status;
      if (input.plan) updateData.plan = input.plan;
      
      if (input.months) {
        const tenant = await db.select().from(tenants).where(eq(tenants.id, input.id)).limit(1);
        if (tenant.length > 0) {
          const currentExpiry = tenant[0].subscriptionExpiresAt ? new Date(tenant[0].subscriptionExpiresAt) : new Date();
          const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
          const newExpiry = new Date(baseDate);
          newExpiry.setMonth(newExpiry.getMonth() + input.months);
          updateData.subscriptionExpiresAt = newExpiry;
        }
      }

      await db.update(tenants)
        .set(updateData)
        .where(eq(tenants.id, input.id));

      return { success: true };
    }),

  /**
   * Deletar tenant
   */
  deleteTenant: ownerProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      // Primeiro, remover usuários do tenant (não deletar, apenas desassociar)
      await db.update(users).set({ tenantId: null, role: 'user' }).where(eq(users.tenantId, input));
      
      // Depois, deletar o tenant
      await db.delete(tenants).where(eq(tenants.id, input));
      
      return { success: true };
    }),

  /**
   * Listar todos os admins
   */
  listAdmins: ownerProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select().from(users).where(eq(users.role, 'admin')).orderBy(sql`${users.createdAt} DESC`);
    } catch (error) {
      console.error("[SuperAdmin] Erro ao listar admins:", error);
      return [];
    }
  }),

  /**
   * Listar todos os usuários
   */
  listAllUsers: ownerProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    try {
      return await db.select().from(users).orderBy(sql`${users.createdAt} DESC`);
    } catch (error) {
      console.error("[SuperAdmin] Erro ao listar usuários:", error);
      return [];
    }
  }),

  /**
   * Criar admin para um tenant
   */
  createAdmin: ownerProcedure
    .input(z.object({
      name: z.string().min(1, "Nome é obrigatório"),
      tenantId: z.number().positive("Tenant é obrigatório"),
      loginId: z.string().min(3).max(64),
      password: z.string().min(4).max(128),
      email: z.string().email("Email inválido").optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      // Verificar se tenant existe
      const tenant = await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
      if (tenant.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Tenant não encontrado" });
      }

      const openId = input.loginId.trim().toLowerCase();

      const { isValidLoginIdOrEmail, isValidPassword, hashPassword } = await import("../_core/password");
      if (!isValidLoginIdOrEmail(openId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Usuário inválido. Use um login (letras/números e ; . _ -) ou um e-mail válido" });
      }
      if (!isValidPassword(input.password)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Senha inválida. Use apenas letras, números e ; . _ -" });
      }

      // Verificar se loginId já existe
      const existing = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
      if (existing.length > 0) {
        // Atualizar usuário existente para admin do tenant
        await db.update(users)
          .set({ 
            role: 'admin', 
            tenantId: input.tenantId, 
            name: input.name,
            email: input.email ? input.email.trim().toLowerCase() : existing[0].email,
            passwordHash: existing[0].passwordHash ?? hashPassword(input.password),
            updatedAt: new Date() 
          })
          .where(eq(users.openId, openId));
        return { success: true, userId: existing[0].id, updated: true };
      }

      // Criar novo usuário admin
      const result = await db.insert(users).values({
        openId,
        email: input.email ? input.email.trim().toLowerCase() : null,
        name: input.name,
        role: 'admin',
        tenantId: input.tenantId,
        loginMethod: 'local',
        passwordHash: (await import("../_core/password")).hashPassword(input.password),
      }).returning({ id: users.id });

      return { success: true, userId: result[0]?.id || 0, updated: false };
    }),

  /**
   * Atualizar admin
   */
  updateAdmin: ownerProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      tenantId: z.number().optional(),
      role: z.enum(["user", "admin"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.tenantId !== undefined) updateData.tenantId = input.tenantId;
      if (input.role) updateData.role = input.role;

      await db.update(users)
        .set(updateData)
        .where(eq(users.id, input.id));

      return { success: true };
    }),

  /**
   * Deletar admin (rebaixa para user)
   */
  deleteAdmin: ownerProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      // Não deletar, apenas rebaixar para user e remover tenant
      await db.update(users)
        .set({ role: 'user', tenantId: null, updatedAt: new Date() })
        .where(eq(users.id, input));
      
      return { success: true };
    }),

  /**
   * Promover usuário a admin de um tenant
   */
  promoteToAdmin: ownerProcedure
    .input(z.object({
      userId: z.number(),
      tenantId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      await db.update(users)
        .set({ role: 'admin', tenantId: input.tenantId, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      return { success: true };
    }),

  /**
   * Owner: listar users por tenant (para envio / seleção)
   */
  listUsersByTenant: ownerProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const data = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          tenantId: users.tenantId,
          createdByAdminId: users.createdByAdminId,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.tenantId, input.tenantId));

      return { data };
    }),

  /**
   * Owner: listar grupos por tenant (para envio / seleção)
   */
  listGroupsByTenant: ownerProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados não disponível" });

      const data = await db
        .select()
        .from(groups)
        .where(eq(groups.tenantId, input.tenantId));

      return { data };
    }),
});
