import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { MESSAGE_ACTION_PATHS, MESSAGE_LEVELS } from "@shared/messagePolicy";
import { getSessionCookieOptions } from "./_core/cookies";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

const ledgerPayload = z.object({ ledgerJson: z.string().min(2).max(1_500_000), schemaVersion: z.number().int().positive().max(100) });
const campaignInput = z.object({
  title: z.string().trim().min(2, "请填写消息标题。").max(80),
  summary: z.string().trim().min(2, "请填写消息摘要。").max(180),
  body: z.string().trim().max(10_000).optional().nullable(),
  level: z.enum(MESSAGE_LEVELS),
  actionLabel: z.string().trim().min(1).max(32).optional().nullable(),
  actionPath: z.enum(MESSAGE_ACTION_PATHS).optional().nullable(),
  targetType: z.enum(["all", "user"]),
  targetUserId: z.number().int().positive().optional().nullable(),
  expiresAt: z.date().optional().nullable(),
}).superRefine((input, ctx) => {
  if (input.targetType === "user" && !input.targetUserId) ctx.addIssue({ code: "custom", path: ["targetUserId"], message: "请选择指定商户。" });
  if (input.actionLabel && !input.actionPath) ctx.addIssue({ code: "custom", path: ["actionPath"], message: "设置动作文字后还需选择应用内跳转位置。" });
  if (input.actionPath && !input.actionLabel) ctx.addIssue({ code: "custom", path: ["actionLabel"], message: "设置跳转位置后还需填写动作文字。" });
});

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
  messages: router({
    unreadCount: protectedProcedure.query(async ({ ctx }) => ({ count: await db.getUnreadMessageCount(ctx.user.id) })),
    importantBanner: protectedProcedure.query(({ ctx }) => db.getImportantMessageBanner(ctx.user.id)),
    list: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(50).default(30) }).default({ limit: 30 })).query(({ ctx, input }) => db.listUserMessages(ctx.user.id, input.limit)),
    markDisplayed: protectedProcedure.input(z.object({ userMessageId: z.number().int().positive() })).mutation(async ({ ctx, input }) => ({ updated: await db.markUserMessageDisplayed(ctx.user.id, input.userMessageId) })),
    markRead: protectedProcedure.input(z.object({ userMessageId: z.number().int().positive() })).mutation(async ({ ctx, input }) => ({ updated: await db.markUserMessageRead(ctx.user.id, input.userMessageId) })),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => ({ updated: await db.markAllUserMessagesRead(ctx.user.id) })),
  }),
  admin: router({
    messages: router({
      preview: adminProcedure.input(campaignInput.pick({ targetType: true, targetUserId: true })).query(async ({ input }) => ({ recipientCount: await db.getMessageRecipientCount(input.targetType, input.targetUserId) })),
      createDraft: adminProcedure.input(campaignInput).mutation(async ({ ctx, input }) => db.createMessageDraft({ ...input, createdByUserId: ctx.user.id })),
      publish: adminProcedure.input(z.object({ campaignId: z.number().int().positive() })).mutation(async ({ input }) => db.publishMessageCampaign(input.campaignId)),
      recall: adminProcedure.input(z.object({ campaignId: z.number().int().positive() })).mutation(async ({ input }) => db.recallMessageCampaign(input.campaignId)),
      list: adminProcedure.query(() => db.listAdminMessageCampaigns()),
      targetUsers: adminProcedure.query(() => db.listMessageTargetUsers()),
    }),
  }),
});

export type AppRouter = typeof appRouter;
