import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

const ledgerPayload = z.object({ ledgerJson: z.string().min(2).max(1_500_000), schemaVersion: z.number().int().positive().max(100) });

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  ledger: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const cloud = await db.getCloudLedger(ctx.user.id);
      return cloud ? { ledgerJson: cloud.ledgerJson, schemaVersion: cloud.schemaVersion, revision: cloud.revision, backedUpAt: cloud.backedUpAt, updatedAt: cloud.updatedAt } : null;
    }),
    backup: protectedProcedure.input(ledgerPayload).mutation(async ({ ctx, input }) => {
      const cloud = await db.backupCloudLedger({ userId: ctx.user.id, ...input });
      if (!cloud) throw new Error("备份保存失败。");
      return { revision: cloud.revision, backedUpAt: cloud.backedUpAt, updatedAt: cloud.updatedAt };
    }),
  }),
});

export type AppRouter = typeof appRouter;
