import { z } from "zod";
import { router, adminOnlyProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { groups, userGroups, users } from "../../drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function requireTenant(ctx: any): number {
  const t = ctx.user?.tenantId;
  if (!t) throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });
  return t;
}

export const groupsRouter = router({
  list: adminOnlyProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { data: [], total: 0 };

      const tenantId = requireTenant(ctx);
      const adminId = ctx.user.id;

      const data = await db
        .select()
        .from(groups)
        .where(and(eq(groups.tenantId, tenantId), eq(groups.createdByAdminId, adminId)))
        .orderBy(sql`${groups.id} DESC`)
        .limit(input?.limit ?? 100);

      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(groups)
        .where(and(eq(groups.tenantId, tenantId), eq(groups.createdByAdminId, adminId)));

      return { data, total: Number(totalRows?.[0]?.count ?? 0) };
    }),

  create: adminOnlyProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const tenantId = requireTenant(ctx);
      const adminId = ctx.user.id;

      const inserted = await db
        .insert(groups)
        .values({
          tenantId,
          name: input.name,
          description: input.description ?? null,
          createdByAdminId: adminId,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning();

      return { success: true, group: inserted[0] };
    }),

  update: adminOnlyProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const tenantId = requireTenant(ctx);
      const adminId = ctx.user.id;

      const found = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.id, input.id), eq(groups.tenantId, tenantId), eq(groups.createdByAdminId, adminId)))
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado" });

      const patch: any = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;

      const updated = await db.update(groups).set(patch).where(eq(groups.id, input.id)).returning();
      return { success: true, group: updated[0] };
    }),

  delete: adminOnlyProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const tenantId = requireTenant(ctx);
      const adminId = ctx.user.id;

      const found = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.id, input.id), eq(groups.tenantId, tenantId), eq(groups.createdByAdminId, adminId)))
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado" });

      await db.delete(userGroups).where(eq(userGroups.groupId, input.id));
      await db.delete(groups).where(eq(groups.id, input.id));

      return { success: true };
    }),

  getMembers: adminOnlyProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { userIds: [] as number[] };

      const tenantId = requireTenant(ctx);
      const adminId = ctx.user.id;

      const found = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.id, input.groupId), eq(groups.tenantId, tenantId), eq(groups.createdByAdminId, adminId)))
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado" });

      const rows = await db
        .select({ userId: userGroups.userId })
        .from(userGroups)
        .where(eq(userGroups.groupId, input.groupId));

      return { userIds: rows.map((r) => r.userId) };
    }),

  setMembers: adminOnlyProcedure
    .input(
      z.object({
        groupId: z.number(),
        memberUserIds: z.array(z.number()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB indisponível" });

      const tenantId = requireTenant(ctx);
      const adminId = ctx.user.id;

      const found = await db
        .select({ id: groups.id })
        .from(groups)
        .where(and(eq(groups.id, input.groupId), eq(groups.tenantId, tenantId), eq(groups.createdByAdminId, adminId)))
        .limit(1);

      if (!found.length) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo não encontrado" });

      // valida users (somente role=user criados pelo admin)
      if (input.memberUserIds.length) {
        const validUsers = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.tenantId, tenantId),
              eq(users.role, "user"),
              eq(users.createdByAdminId, adminId),
              inArray(users.id, input.memberUserIds)
            )
          );

        const validIds = new Set(validUsers.map((u) => u.id));
        const bad = input.memberUserIds.filter((id) => !validIds.has(id));
        if (bad.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Usuários inválidos" });
      }

      await db.transaction(async (tx) => {
        await tx.delete(userGroups).where(eq(userGroups.groupId, input.groupId));

        if (input.memberUserIds.length) {
          await tx.insert(userGroups).values(
            input.memberUserIds.map((userId) => ({
              groupId: input.groupId,
              userId,
              createdAt: new Date(),
            }))
          );
        }
      });

      return { success: true };
    }),
});
