import { z } from "zod";
import { router, adminOnlyProcedure, ownerOnlyProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { notifications, deliveries, users, groups, userGroups, tenants } from "../../drizzle/schema";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function requireTenant(ctx: any): number {
  const t = ctx.user?.tenantId;
  if (!t) throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });
  return t;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });
  return db;
}

export const notificationsRouter = router({
  /**
   * Lista notificações enviadas (Admin/Owner).
   * - admin: lista apenas do próprio tenant
   * - owner: pode listar por tenantId (ou tudo se não informar)
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(100),
        offset: z.number().min(0).default(0),
        tenantId: z.number().optional().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Não autenticado" });
      if (ctx.user.role === "user") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas admin/owner" });

      const db = await requireDb();

      const effectiveTenantId =
        ctx.user.role === "owner" ? (input.tenantId ?? null) : (ctx.user.tenantId ?? null);

      if (ctx.user.role !== "owner" && !effectiveTenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant não definido" });
      }

      const whereClause = effectiveTenantId ? eq(notifications.tenantId, effectiveTenantId) : undefined;

      const data = await db
        .select()
        .from(notifications)
        .where(whereClause as any)
        .orderBy(sql`${notifications.createdAt} DESC`)
        .limit(input.limit)
        .offset(input.offset);

      // total
      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(whereClause as any);

      return { data, total: Number(totalRows?.[0]?.count ?? 0) };
    }),

  /**
   * ADMIN: Enviar mensagem (cria notification + deliveries reais)
   * Destinos: all | users | groups (sempre role=user)
   */
  send: adminOnlyProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        priority: z.enum(["normal", "important", "urgent"]).default("normal"),
        targetType: z.enum(["all", "users", "groups"]),
        targetIds: z.array(z.number()).default([]),
        imageUrl: z.string().optional(),
        videoUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      const tenantId = requireTenant(ctx);
      const adminId = ctx.user.id;

      // 1) Resolver destinatários (userIds) com isolamento total
      let userIds: number[] = [];

      if (input.targetType === "all") {
        const rows = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(eq(users.tenantId, tenantId), eq(users.role, "user"), eq(users.createdByAdminId, adminId))
          );
        userIds = rows.map((r) => r.id);
      }

      if (input.targetType === "users") {
        if (!input.targetIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione usuários" });

        const rows = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.tenantId, tenantId),
              eq(users.role, "user"),
              eq(users.createdByAdminId, adminId),
              inArray(users.id, input.targetIds)
            )
          );

        userIds = rows.map((r) => r.id);
        if (!userIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Usuários inválidos" });
      }

      if (input.targetType === "groups") {
        if (!input.targetIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione grupos" });

        // valida grupos do admin
        const validGroups = await db
          .select({ id: groups.id })
          .from(groups)
          .where(
            and(
              eq(groups.tenantId, tenantId),
              eq(groups.createdByAdminId, adminId),
              inArray(groups.id, input.targetIds)
            )
          );

        const groupIds = validGroups.map((g) => g.id);
        if (!groupIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Grupos inválidos" });

        // expandir membros
        const members = await db
          .select({ userId: userGroups.userId })
          .from(userGroups)
          .where(inArray(userGroups.groupId, groupIds));

        const uniq = new Set<number>();
        for (const m of members) uniq.add(m.userId);

        const memberIds = Array.from(uniq);
        if (!memberIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Grupo sem membros" });

        // validar que todos os membros pertencem ao admin (createdByAdminId)
        const okMembers = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.tenantId, tenantId),
              eq(users.role, "user"),
              eq(users.createdByAdminId, adminId),
              inArray(users.id, memberIds)
            )
          );

        userIds = okMembers.map((u) => u.id);

        if (!userIds.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Membros inválidos para este admin" });
        }
      }

      if (!userIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum destinatário" });

      // 2) Persistir notification + deliveries em transação
      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(notifications)
          .values({
            tenantId,
            title: input.title,
            content: input.content,
            priority: input.priority,
            createdBy: adminId,
            targetType: input.targetType,
            targetIds: input.targetIds,
            imageUrl: input.imageUrl,
            isScheduled: false,
            isActive: true,
            createdAt: now,
          })
          .returning({ id: notifications.id });

        const notificationId = inserted[0]?.id!;
        const rows = userIds.map((uid) => ({
          tenantId,
          notificationId,
          userId: uid,
          status: "sent" as const,
          isRead: false,
        }));

        await tx.insert(deliveries).values(rows);
        return { notificationId, deliveries: rows.length };
      });

      return { success: true, ...result };
    }),

  /**
   * OWNER: Enviar mensagem (cria notification + deliveries reais)
   * Suporta:
   * - por tenant (tenantId obrigatório ou tenants[] quando targetType=tenants)
   * - destinos: all | users | groups | admins | tenants
   */
  ownerSend: ownerOnlyProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        content: z.string().min(1),
        priority: z.enum(["normal", "important", "urgent"]).default("normal"),
        targetType: z.enum(["all", "users", "groups", "admins", "tenants"]),
        targetIds: z.array(z.number()).default([]),
        tenantId: z.number().optional(), // obrigatório exceto quando targetType=tenants
        imageUrl: z.string().optional(),
        videoUrl: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const ownerId = ctx.user.id;

      // resolve lista de tenants alvo
      const tenantIds: number[] =
        input.targetType === "tenants"
          ? Array.from(new Set(input.targetIds))
          : input.tenantId
            ? [input.tenantId]
            : [];

      if (!tenantIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione tenant" });

      // validar tenants existem
      const validTenants = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.id, tenantIds));
      const validTenantIds = validTenants.map(t => t.id);
      if (!validTenantIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenants inválidos" });

      let totalDeliveries = 0;
      const createdNotificationIds: number[] = [];

      for (const tenantId of validTenantIds) {
        // 1) resolver destinatários
        let userIds: number[] = [];

        if (input.targetType === "admins") {
          // admins do tenant (todos ou ids específicos)
          const where = input.targetIds.length
            ? and(eq(users.tenantId, tenantId), eq(users.role, "admin"), inArray(users.id, input.targetIds))
            : and(eq(users.tenantId, tenantId), eq(users.role, "admin"));
          const rows = await db.select({ id: users.id }).from(users).where(where as any);
          userIds = rows.map(r => r.id);
          if (!userIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum admin encontrado" });
        } else if (input.targetType === "all") {
          // todos users comuns do tenant
          const rows = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.role, "user")));
          userIds = rows.map(r => r.id);
        } else if (input.targetType === "users") {
          if (!input.targetIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione usuários" });
          const rows = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), inArray(users.id, input.targetIds)));
          userIds = rows.map(r => r.id);
        } else if (input.targetType === "groups") {
          if (!input.targetIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione grupos" });

          // valida grupos do tenant
          const validGroups = await db
            .select({ id: groups.id })
            .from(groups)
            .where(and(eq(groups.tenantId, tenantId), inArray(groups.id, input.targetIds)));

          const groupIds = validGroups.map(g => g.id);
          if (!groupIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Grupos inválidos" });

          const members = await db
            .select({ userId: userGroups.userId })
            .from(userGroups)
            .where(inArray(userGroups.groupId, groupIds));

          const uniq = new Set<number>();
          for (const m of members) uniq.add(m.userId);

          const memberIds = Array.from(uniq);
          if (!memberIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Grupo sem membros" });

          const rows = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.role, "user"), inArray(users.id, memberIds)));

          userIds = rows.map(r => r.id);
        } else if (input.targetType === "tenants") {
          // já iterando por tenant; equivale a "all"
          const rows = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.role, "user")));
          userIds = rows.map(r => r.id);
        }

        if (!userIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum destinatário" });

        // 2) persistir em transação
        const now = new Date();
        const result = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(notifications)
            .values({
              tenantId,
              title: input.title,
              content: input.content,
              priority: input.priority,
              createdBy: ownerId,
              // DB só aceita all|users|groups — mapeia admins->users, tenants->all
              targetType:
                input.targetType === "admins"
                  ? "users"
                  : input.targetType === "tenants"
                    ? "all"
                    : (input.targetType as any),
              targetIds: input.targetIds,
              imageUrl: input.imageUrl,
              isScheduled: false,
              isActive: true,
              createdAt: now,
            })
            .returning({ id: notifications.id });

          const notificationId = inserted[0]?.id!;
          const rows = userIds.map((uid) => ({
            tenantId,
            notificationId,
            userId: uid,
            status: "sent" as const,
            isRead: false,
          }));
          await tx.insert(deliveries).values(rows);
          return { notificationId, deliveries: rows.length };
        });

        createdNotificationIds.push(result.notificationId);
        totalDeliveries += result.deliveries;
      }

      return { success: true, notificationIds: createdNotificationIds, deliveries: totalDeliveries };
    }),

  /**
   * USER/ADMIN: Inbox (mensagens recebidas)
   * - user: vê sempre
   * - admin: só verá se receber delivery real (ex.: owner enviou para admins)
   */
  inboxList: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      if (ctx.user.role !== "user" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas user/admin" });
      }

      const rows = await db
        .select({
          deliveryId: deliveries.id,
          notificationId: notifications.id,
          title: notifications.title,
          content: notifications.content,
          imageUrl: notifications.imageUrl,
          priority: notifications.priority,
          createdAt: notifications.createdAt,
          isRead: deliveries.isRead,
          readAt: deliveries.readAt,
          feedback: deliveries.feedback,
          feedbackAt: deliveries.feedbackAt,
          tenantId: notifications.tenantId,
        })
        .from(deliveries)
        .innerJoin(notifications, eq(deliveries.notificationId, notifications.id))
        .where(
          and(eq(deliveries.userId, ctx.user.id), eq(deliveries.tenantId, notifications.tenantId))
        )
        .orderBy(desc(deliveries.id))
        .limit(input.limit)
        .offset(input.offset);

      // total
      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(deliveries)
        .where(eq(deliveries.userId, ctx.user.id));

      return { data: rows, total: Number(totalRows?.[0]?.count ?? 0) };
    }),

  inboxCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    if (ctx.user.role !== "user" && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Apenas user/admin" });
    }

    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(deliveries)
      .where(and(eq(deliveries.userId, ctx.user.id), eq(deliveries.isRead, false)));

    const value = rows?.[0]?.count ?? 0;
    return { count: Number(value ?? 0) };
  }),

  /**
   * USER/ADMIN: marcar como lida
   */
  markAsRead: protectedProcedure
    .input(z.object({ deliveryId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      if (ctx.user.role !== "user" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas user/admin" });
      }

      await db
        .update(deliveries)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(deliveries.id, input.deliveryId), eq(deliveries.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * USER/ADMIN: feedback (gostei / renovar / não gostei)
   */
  setFeedback: protectedProcedure
    .input(
      z.object({
        deliveryId: z.number(),
        feedback: z.enum(["liked", "renew", "disliked"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();

      if (ctx.user.role !== "user" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Apenas user/admin" });
      }

      const existing = await db
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(and(eq(deliveries.id, input.deliveryId), eq(deliveries.userId, ctx.user.id)))
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Entrega não encontrada" });

      await db
        .update(deliveries)
        .set({
          feedback: input.feedback,
          feedbackAt: new Date(),
        })
        .where(eq(deliveries.id, input.deliveryId));

      return { success: true };
    }),
});
