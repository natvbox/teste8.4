import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { storageGet } from "../storage";
import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function requireDbOrThrow(db: any) {
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados não disponível",
    });
  }
}

function requireTenantId(ctx: any): number {
  const tid = ctx.user?.tenantId;
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });
  return tid;
}

export const filesRouter = router({
  /**
   * ✅ IMPORTANTE:
   * Upload de arquivo NÃO deve ser feito por tRPC com Buffer.
   * Use o uploadRouter (REST/multipart) e grave apenas o metadata aqui.
   */
  createMetadata: protectedProcedure
    .input(
      z.object({
        tenantId: z.number().optional(), // owner pode escolher
        filename: z.string().min(1),
        fileKey: z.string().min(1),
        url: z.string().min(1),
        mimeType: z.string().optional(),
        fileSize: z.number().int().nonnegative().optional(),
        relatedNotificationId: z.number().optional(),
        isPublic: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      requireDbOrThrow(db);

      const role = ctx.user.role;

      // tenant alvo:
      // - owner: pode escolher tenantId (obrigatório para salvar com consistência)
      // - admin/user: sempre o tenantId do usuário
      const tenantId =
        role === "owner"
          ? input.tenantId
          : requireTenantId(ctx);

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "tenantId é obrigatório (owner deve informar)",
        });
      }

      const inserted = await db
        .insert(files)
        .values({
          tenantId,
          filename: input.filename,
          fileKey: input.fileKey,
          url: input.url,
          mimeType: input.mimeType ?? null,
          fileSize: input.fileSize ?? null,
          uploadedBy: ctx.user.id,
          uploadedAt: new Date(),
          relatedNotificationId: input.relatedNotificationId ?? null,
          isPublic: input.isPublic,
        } as any)
        .returning({ id: files.id });

      return {
        success: true,
        id: inserted[0]?.id || 0,
      };
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(20),
        offset: z.number().min(0).default(0),
        tenantId: z.number().optional().nullable(), // owner pode filtrar
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      requireDbOrThrow(db);

      const role = ctx.user.role;

      // regras:
      // - owner: pode ver tudo, opcionalmente filtrar por tenantId
      // - admin: só do próprio tenant
      // - user: só o que ele enviou + do tenant dele
      let whereClause: any = undefined;

      if (role === "owner") {
        if (input.tenantId) {
          whereClause = eq(files.tenantId, input.tenantId);
        }
      } else if (role === "admin") {
        const tid = requireTenantId(ctx);
        whereClause = eq(files.tenantId, tid);
      } else {
        const tid = requireTenantId(ctx);
        whereClause = and(eq(files.tenantId, tid), eq(files.uploadedBy, ctx.user.id));
      }

      const data = await db
        .select()
        .from(files)
        .where(whereClause)
        .orderBy(sql`${files.id} DESC`)
        .limit(input.limit)
        .offset(input.offset);

      const totalRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(files)
        .where(whereClause);

      return {
        success: true,
        data,
        total: Number(totalRows?.[0]?.count ?? 0),
      };
    }),

  getDownloadUrl: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input: fileId }) => {
      const db = await getDb();
      requireDbOrThrow(db);

      const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
      if (!rows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });
      }

      const file = rows[0];

      // autorização:
      // - owner: ok
      // - admin: só do tenant dele
      // - user: se uploadedBy dele OU isPublic
      if (ctx.user.role === "owner") {
        // ok
      } else if (ctx.user.role === "admin") {
        const tid = requireTenantId(ctx);
        if (file.tenantId !== tid) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
        }
      } else {
        const tid = requireTenantId(ctx);
        const sameTenant = file.tenantId === tid;
        const canRead = file.uploadedBy === ctx.user.id || file.isPublic;
        if (!sameTenant || !canRead) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para acessar este arquivo" });
        }
      }

      const { url } = await storageGet(file.fileKey);

      return { success: true, url, filename: file.filename };
    }),

  delete: protectedProcedure
    .input(z.number())
    .mutation(async ({ ctx, input: fileId }) => {
      const db = await getDb();
      requireDbOrThrow(db);

      const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
      if (!rows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });
      }

      const file = rows[0];

      // autorização:
      // - owner: ok
      // - admin: só do tenant dele
      // - user: só se uploadedBy dele
      if (ctx.user.role === "owner") {
        // ok
      } else if (ctx.user.role === "admin") {
        const tid = requireTenantId(ctx);
        if (file.tenantId !== tid) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
      } else {
        const tid = requireTenantId(ctx);
        if (file.tenantId !== tid || file.uploadedBy !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para deletar este arquivo" });
        }
      }

      // remove do banco (e o storage deve ser removido pelo uploadRouter/storageDelete, se existir)
      await db.delete(files).where(eq(files.id, fileId));

      return { success: true, message: "Arquivo deletado com sucesso" };
    }),

  getById: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input: fileId }) => {
      const db = await getDb();
      requireDbOrThrow(db);

      const rows = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
      if (!rows.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Arquivo não encontrado" });
      }

      const file = rows[0];

      if (ctx.user.role === "owner") {
        return { success: true, data: file };
      }

      if (ctx.user.role === "admin") {
        const tid = requireTenantId(ctx);
        if (file.tenantId !== tid) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão" });
        return { success: true, data: file };
      }

      const tid = requireTenantId(ctx);
      const sameTenant = file.tenantId === tid;
      const canRead = file.uploadedBy === ctx.user.id || file.isPublic;
      if (!sameTenant || !canRead) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem permissão para acessar este arquivo" });
      }

      return { success: true, data: file };
    }),
});
