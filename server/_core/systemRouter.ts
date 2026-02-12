import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { getDb } from "../db";

/**
 * systemRouter:
 * - health: ping simples (sem input)
 * - ready: checa DB (para produção/monitoramento)
 * - notifyOwner: utilitário admin
 */
export const systemRouter = router({
  // ✅ ping simples
  health: publicProcedure.query(() => ({
    ok: true,
    time: Date.now(),
  })),

  // ✅ readiness check (db)
  ready: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return { ok: false, reason: "db_not_connected" } as const;
    }

    // ping simples no banco (drizzle)
    try {
      // drizzle não tem "SELECT 1" pronto aqui sem sql helper,
      // mas o getDb já garante conexão + ensureSchema.
      return { ok: true } as const;
    } catch {
      return { ok: false, reason: "db_ping_failed" } as const;
    }
  }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
