import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { files } from "../../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function requireTenantId(ctx: any): number {
  const tid = ctx.user?.tenantId;
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Sem tenant" });
  return tid;
}

function sanitizeFilename(name: string) {
  const base = name.split("/").pop()?.split("\\").pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
}

function extFromMime(mime: string) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "bin";
}

function decodeBase64Data(input: string): Buffer {
  // aceita "data:mime;base64,AAAA" ou apenas "AAAA"
  const base64 = input.includes("base64,") ? input.split("base64,")[1] : input.includes(",") ? input.split(",")[1] : input;
  return Buffer.from(base64, "base64");
}

export const uploadRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1, "Nome do arquivo é obrigatório"),
        fileData: z.string().min(1, "fileData é obrigatório"),
        mimeType: z.string().min(1, "Tipo MIME é obrigatório"),
        relatedNotificationId: z.number().optional(),

        // owner precisa informar o tenant alvo
        tenantId: z.number().optional(),

        isPublic: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 🔒 Upload é ação administrativa
      if (ctx.user.role === "user") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas admin/owner podem enviar arquivos",
        });
      }

      if (!allowedTypes.has(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tipo de arquivo não permitido. Apenas imagens e vídeos são aceitos.",
        });
      }

      const buffer = decodeBase64Data(input.fileData);

      const maxSize = 100 * 1024 * 1024; // 100MB
      if (buffer.length > maxSize) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Arquivo muito grande. Tamanho máximo: 100MB",
        });
      }

      // tenant alvo:
      // - owner: deve informar tenantId
      // - admin: usa tenantId do ctx (ignora input.tenantId)
      const tenantId =
        ctx.user.role === "owner" ? input.tenantId : requireTenantId(ctx);

      if (!tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "tenantId é obrigatório (owner deve informar)",
        });
      }

      const safeName = sanitizeFilename(input.filename);
      const providedExt = safeName.includes(".") ? safeName.split(".").pop() : null;
      const ext = (providedExt && providedExt.length <= 8 ? providedExt : extFromMime(input.mimeType)).toLowerCase();

      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 10);
      const fileKey = `uploads/${tenantId}/${ctx.user.id}/${ts}-${rand}.${ext}`;

      const { url } = await storagePut(fileKey, buffer, input.mimeType);

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Banco de dados não disponível",
        });
      }

      const inserted = await db
        .insert(files)
        .values({
          tenantId,
          filename: safeName,
          fileKey,
          url,
          mimeType: input.mimeType,
          fileSize: buffer.length,
          uploadedBy: ctx.user.id,
          uploadedAt: new Date(),
          relatedNotificationId: input.relatedNotificationId ?? null,
          isPublic: input.isPublic,
        } as any)
        .returning({ id: files.id });

      return { success: true, fileId: inserted[0]?.id || 0, url };
    }),

  listFiles: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).default(20),
        offset: z.number().min(0).default(0),
        tenantId: z.number().optional().nullable(), // owner pode filtrar
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false, data: [], total: 0 };

      const role = ctx.user.role;

      // - owner: tudo (ou filtro)
      // - admin: só do tenant
      // - user: bloqueado (segurança)
      if (role === "user") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Apenas admin/owner podem listar arquivos",
        });
      }

      let whereClause: any = undefined;

      if (role === "owner") {
        if (input.tenantId) whereClause = eq(files.tenantId, input.tenantId);
      } else {
        const tid = requireTenantId(ctx);
        whereClause = eq(files.tenantId, tid);
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

      return { success: true, data, total: Number(totalRows?.[0]?.count ?? 0) };
    }),
});
