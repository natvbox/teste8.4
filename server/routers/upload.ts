import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { files, InsertFile } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";

export const uploadRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1, "Nome do arquivo é obrigatório"),
        fileData: z.string(),
        mimeType: z.string().min(1, "Tipo MIME é obrigatório"),
        relatedNotificationId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'video/mp4',
          'video/webm',
          'video/quicktime',
          'audio/mpeg',
          'audio/wav',
          'audio/ogg',
        ];

        if (!allowedTypes.includes(input.mimeType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Tipo de arquivo não permitido. Apenas imagens, vídeos e áudios são aceitos.",
          });
        }

        const buffer = Buffer.from(input.fileData.split(',')[1] || input.fileData, 'base64');

        const maxSize = 100 * 1024 * 1024;
        if (buffer.length > maxSize) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Arquivo muito grande. Tamanho máximo: 100MB",
          });
        }

        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 15);
        const extension = input.filename.split('.').pop();
        const fileKey = `uploads/${ctx.user.id}/${timestamp}-${randomStr}.${extension}`;

        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados não disponível",
          });
        }

        const newFile: InsertFile = {
          tenantId: ctx.user.tenantId || 0,
          filename: input.filename,
          fileKey: fileKey,
          url: url,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          relatedNotificationId: input.relatedNotificationId,
          isPublic: true,
        };

        const result = await db.insert(files).values(newFile).returning({ id: files.id });

        return {
          success: true,
          fileId: result[0]?.id || 0,
          url: url,
        };
      } catch (error) {
        console.error("[Upload] Erro ao processar upload:", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao processar upload";
        console.error("[Upload] Detalhes do erro:", errorMessage);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Erro ao processar upload: ${errorMessage}`,
        });
      }
    }),

  listFiles: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(20),
        offset: z.number().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false, data: [], total: 0 };

      const isAdmin = ctx.user.role === 'admin' || ctx.user.role === 'owner';
      
      let result;
      if (isAdmin) {
        result = await db
          .select()
          .from(files)
          .limit(input.limit)
          .offset(input.offset);
      } else {
        result = await db
          .select()
          .from(files)
          .where(eq(files.uploadedBy, ctx.user.id))
          .limit(input.limit)
          .offset(input.offset);
      }

      return {
        success: true,
        data: result,
        total: result.length,
      };
    }),
});
