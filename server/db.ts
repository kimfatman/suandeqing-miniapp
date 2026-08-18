import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { cloudLedgers, messageCampaigns, type CloudLedger, type InsertUser, type MessageCampaign, type UserMessage, userMessages, users } from "../drizzle/schema";
import type { MessageLevel } from "@shared/messagePolicy";
import { ENV } from "./_core/env";

let database: ReturnType<typeof drizzle> | null = null;
export const getDb = async () => {
  if (!database && process.env.DATABASE_URL) database = drizzle(process.env.DATABASE_URL);
  return database;
};

export async function upsertUser(user: InsertUser) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  await db.insert(users).values({ ...user, role, lastSignedIn: user.lastSignedIn ?? new Date() }).onDuplicateKeyUpdate({
    set: { name: user.name ?? null, email: user.email ?? null, loginMethod: user.loginMethod ?? null, lastSignedIn: user.lastSignedIn ?? new Date() },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function getCloudLedger(userId: number): Promise<CloudLedger | undefined> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  return (await db.select().from(cloudLedgers).where(eq(cloudLedgers.userId, userId)).limit(1))[0];
}

export async function backupCloudLedger(input: { userId: number; ledgerJson: string; schemaVersion: number }) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const existing = await getCloudLedger(input.userId);
  const revision = (existing?.revision ?? 0) + 1;
  const now = new Date();
  await db.insert(cloudLedgers).values({ ...input, revision, backedUpAt: now, updatedAt: now }).onDuplicateKeyUpdate({
    set: { ledgerJson: input.ledgerJson, schemaVersion: input.schemaVersion, revision, backedUpAt: now, updatedAt: now },
  });
  return getCloudLedger(input.userId);
}

export type MessageDraftInput = {
  createdByUserId: number;
  title: string;
  summary: string;
  body?: string | null;
  level: MessageLevel;
  actionLabel?: string | null;
  actionPath?: string | null;
  targetType: "all" | "user";
  targetUserId?: number | null;
  expiresAt?: Date | null;
};

export async function createMessageDraft(input: MessageDraftInput): Promise<MessageCampaign> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const result = await db.insert(messageCampaigns).values({ ...input, status: "draft" });
  const id = Number(result[0].insertId);
  const campaign = (await db.select().from(messageCampaigns).where(eq(messageCampaigns.id, id)).limit(1))[0];
  if (!campaign) throw new Error("消息草稿创建失败。");
  return campaign;
}

export async function getMessageCampaign(campaignId: number): Promise<MessageCampaign | undefined> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  return (await db.select().from(messageCampaigns).where(eq(messageCampaigns.id, campaignId)).limit(1))[0];
}

export async function getMessageRecipientCount(targetType: "all" | "user", targetUserId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  if (targetType === "user") return targetUserId ? Number((await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.id, targetUserId)))[0]?.count ?? 0) : 0;
  return Number((await db.select({ count: sql<number>`count(*)` }).from(users))[0]?.count ?? 0);
}

export async function publishMessageCampaign(campaignId: number): Promise<MessageCampaign> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const campaign = await getMessageCampaign(campaignId);
  if (!campaign) throw new Error("消息草稿不存在。");
  if (campaign.status !== "draft") throw new Error("只有草稿可以发布。");
  const recipients = campaign.targetType === "user" ? (campaign.targetUserId ? [campaign.targetUserId] : []) : (await db.select({ id: users.id }).from(users)).map((user) => user.id);
  if (!recipients.length) throw new Error("没有符合条件的收件人，消息未发布。");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(userMessages).values(recipients.map((userId) => ({ campaignId, userId, createdAt: now })));
    await tx.update(messageCampaigns).set({ status: "published", recipientCount: recipients.length, publishedAt: now, updatedAt: now }).where(eq(messageCampaigns.id, campaignId));
  });
  const published = await getMessageCampaign(campaignId);
  if (!published) throw new Error("消息发布失败。");
  return published;
}

export async function recallMessageCampaign(campaignId: number): Promise<MessageCampaign> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const campaign = await getMessageCampaign(campaignId);
  if (!campaign) throw new Error("消息不存在。");
  if (campaign.status !== "published") throw new Error("只有已发布消息可以撤回。");
  const now = new Date();
  await db.update(messageCampaigns).set({ status: "recalled", recalledAt: now, updatedAt: now }).where(eq(messageCampaigns.id, campaignId));
  const recalled = await getMessageCampaign(campaignId);
  if (!recalled) throw new Error("消息撤回失败。");
  return recalled;
}

export async function listAdminMessageCampaigns() {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  return db.select().from(messageCampaigns).orderBy(desc(messageCampaigns.createdAt)).limit(30);
}

export async function listMessageTargetUsers() {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  return db.select({ id: users.id, name: users.name, email: users.email, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.lastSignedIn)).limit(100);
}

const activeMessageWhere = (userId: number, now: Date) => and(eq(userMessages.userId, userId), eq(messageCampaigns.status, "published"), or(isNull(messageCampaigns.expiresAt), gt(messageCampaigns.expiresAt, now)));

export async function listUserMessages(userId: number, limit = 30) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  return db.select({ id: userMessages.id, campaignId: messageCampaigns.id, title: messageCampaigns.title, summary: messageCampaigns.summary, body: messageCampaigns.body, level: messageCampaigns.level, actionLabel: messageCampaigns.actionLabel, actionPath: messageCampaigns.actionPath, publishedAt: messageCampaigns.publishedAt, readAt: userMessages.readAt, createdAt: userMessages.createdAt }).from(userMessages).innerJoin(messageCampaigns, eq(userMessages.campaignId, messageCampaigns.id)).where(activeMessageWhere(userId, new Date())).orderBy(desc(messageCampaigns.publishedAt), desc(userMessages.createdAt)).limit(limit);
}

export async function getImportantMessageBanner(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  return (await db.select({ id: userMessages.id, campaignId: messageCampaigns.id, title: messageCampaigns.title, summary: messageCampaigns.summary, body: messageCampaigns.body, level: messageCampaigns.level, actionLabel: messageCampaigns.actionLabel, actionPath: messageCampaigns.actionPath, publishedAt: messageCampaigns.publishedAt, readAt: userMessages.readAt, createdAt: userMessages.createdAt }).from(userMessages).innerJoin(messageCampaigns, eq(userMessages.campaignId, messageCampaigns.id)).where(and(activeMessageWhere(userId, new Date()), eq(messageCampaigns.level, "important"), isNull(userMessages.displayedAt))).orderBy(desc(messageCampaigns.publishedAt), desc(userMessages.createdAt)).limit(1))[0];
}

export async function getUnreadMessageCount(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const result = await db.select({ count: sql<number>`count(*)` }).from(userMessages).innerJoin(messageCampaigns, eq(userMessages.campaignId, messageCampaigns.id)).where(and(activeMessageWhere(userId, new Date()), isNull(userMessages.readAt)));
  return Number(result[0]?.count ?? 0);
}

export async function markUserMessageRead(userId: number, userMessageId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const result = await db.update(userMessages).set({ readAt: new Date() }).where(and(eq(userMessages.id, userMessageId), eq(userMessages.userId, userId), isNull(userMessages.readAt)));
  return result[0].affectedRows > 0;
}

export async function markUserMessageDisplayed(userId: number, userMessageId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const result = await db.update(userMessages).set({ displayedAt: new Date() }).where(and(eq(userMessages.id, userMessageId), eq(userMessages.userId, userId), isNull(userMessages.displayedAt)));
  return result[0].affectedRows > 0;
}

export async function markAllUserMessagesRead(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库暂不可用，请稍后重试。");
  const unread = await db.select({ id: userMessages.id }).from(userMessages).innerJoin(messageCampaigns, eq(userMessages.campaignId, messageCampaigns.id)).where(and(activeMessageWhere(userId, new Date()), isNull(userMessages.readAt)));
  if (!unread.length) return 0;
  const result = await db.update(userMessages).set({ readAt: new Date() }).where(inArray(userMessages.id, unread.map((item) => item.id)));
  return Number(result[0].affectedRows ?? 0);
}
