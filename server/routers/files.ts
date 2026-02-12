import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { files, InsertFile } from "../../drizzle/schema";
import { storagePut, storageGet } from "../storage";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";

export const filesRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1, "Nome do arquivo é obrigatório"),
        fileData: z.instanceof(Buffer),
        mimeType: z.string().default("application/octet-stream"),
        relatedNotificationId: z.number().optional(),
        isPublic: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados não disponível",
        });
      }

      try {
        const fileKey = `${ctx.user.id}-files/${nanoid()}-${input.filename}`;
        const { url } = await storagePut(fileKey, input.fileData, input.mimeType);

        const newFile: InsertFile = {
          tenantId: ctx.user.tenantId || 0,
          filename: input.filename,
          fileKey: fileKey,
          url: url,
          mimeType: input.mimeType,
          fileSize: input.fileData.length,
          uploadedBy: ctx.user.id,
          relatedNotificationId: input.relatedNotificationId,
          isPublic: input.isPublic,
        };

        const result = await db.insert(files).values(newFile).returning({ id: files.id });

        return {
          success: true,
          message: "Arquivo enviado com sucesso",
          url: url,
          fileKey: fileKey,
          id: result[0]?.id || 0,
        };
      } catch (error) {
        console.error("[Files] Erro ao fazer upload:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao fazer upload do arquivo",
        });
      }
    }),

  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados não disponível",
        });
      }

      try {
        const isAdmin = ctx.user.role === "admin" || ctx.user.role === "owner";
        
        let query;
        if (isAdmin) {
          query = await db
            .select()
            .from(files)
            .limit(input.limit)
            .offset(input.offset);
        } else {
          query = await db
            .select()
            .from(files)
            .where(eq(files.uploadedBy, ctx.user.id))
            .limit(input.limit)
            .offset(input.offset);
        }

        return {
          success: true,
          data: query,
          total: query.length,
        };
      } catch (error) {
        console.error("[Files] Erro ao listar:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao listar arquivos",
        });
      }
    }),

  getDownloadUrl: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input: fileId }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados não disponível",
        });
      }

      try {
        const result = await db
          .select()
          .from(files)
          .where(eq(files.id, fileId))
          .limit(1);

        if (result.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Arquivo não encontrado",
          });
        }

        const file = result[0];

        if (
          ctx.user.role !== "admin" &&
          ctx.user.role !== "owner" &&
          file.uploadedBy !== ctx.user.id &&
          !file.isPublic
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para acessar este arquivo",
          });
        }

        const { url } = await storageGet(file.fileKey);

        return {
          success: true,
          url: url,
          filename: file.filename,
        };
      } catch (error) {
        console.error("[Files] Erro ao obter URL:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao obter URL de download",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.number())
    .mutation(async ({ ctx, input: fileId }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados não disponível",
        });
      }

      try {
        const result = await db
          .select()
          .from(files)
          .where(eq(files.id, fileId))
          .limit(1);

        if (result.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Arquivo não encontrado",
          });
        }

        const file = result[0];

        if (ctx.user.role !== "admin" && ctx.user.role !== "owner" && file.uploadedBy !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para deletar este arquivo",
          });
        }

        await db.delete(files).where(eq(files.id, fileId));

        return {
          success: true,
          message: "Arquivo deletado com sucesso",
        };
      } catch (error) {
        console.error("[Files] Erro ao deletar:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao deletar arquivo",
        });
      }
    }),

  getById: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input: fileId }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados não disponível",
        });
      }

      try {
        const result = await db
          .select()
          .from(files)
          .where(eq(files.id, fileId))
          .limit(1);

        if (result.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Arquivo não encontrado",
          });
        }

        const file = result[0];

        if (
          ctx.user.role !== "admin" &&
          ctx.user.role !== "owner" &&
          file.uploadedBy !== ctx.user.id &&
          !file.isPublic
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Você não tem permissão para acessar este arquivo",
          });
        }

        return {
          success: true,
          data: file,
        };
      } catch (error) {
        console.error("[Files] Erro ao obter:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro ao obter arquivo",
        });
      }
    }),
});
