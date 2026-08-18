import { index, int, longtext, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** 一位账号对应一个可恢复账本；revision 只用于明确冲突，不用于自动合并账务数据。 */
export const cloudLedgers = mysqlTable("cloud_ledgers", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  ledgerJson: longtext("ledgerJson").notNull(),
  schemaVersion: int("schemaVersion").notNull().default(1),
  revision: int("revision").notNull().default(1),
  backedUpAt: timestamp("backedUpAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CloudLedger = typeof cloudLedgers.$inferSelect;

/** 管理员编写的站内消息；发布时会生成用户收件人快照，避免目标范围在事后漂移。 */
export const messageCampaigns = mysqlTable("message_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  createdByUserId: int("createdByUserId").notNull(),
  title: varchar("title", { length: 80 }).notNull(),
  summary: varchar("summary", { length: 180 }).notNull(),
  body: text("body"),
  level: mysqlEnum("level", ["safety", "important", "update", "info"]).notNull().default("info"),
  actionLabel: varchar("actionLabel", { length: 32 }),
  actionPath: varchar("actionPath", { length: 128 }),
  targetType: mysqlEnum("targetType", ["all", "user"]).notNull(),
  targetUserId: int("targetUserId"),
  recipientCount: int("recipientCount").notNull().default(0),
  status: mysqlEnum("status", ["draft", "published", "recalled"]).notNull().default("draft"),
  publishedAt: timestamp("publishedAt"),
  expiresAt: timestamp("expiresAt"),
  recalledAt: timestamp("recalledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("message_campaign_status_published_idx").on(table.status, table.publishedAt),
  index("message_campaign_creator_idx").on(table.createdByUserId),
]);

export type MessageCampaign = typeof messageCampaigns.$inferSelect;

/** 每次投递都固化为用户收件记录；所有读取与已读操作均按 userId 严格隔离。 */
export const userMessages = mysqlTable("user_messages", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  userId: int("userId").notNull(),
  readAt: timestamp("readAt"),
  displayedAt: timestamp("displayedAt"),
  dismissedAt: timestamp("dismissedAt"),
  actionedAt: timestamp("actionedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("user_message_campaign_user_unique").on(table.campaignId, table.userId),
  index("user_message_user_read_created_idx").on(table.userId, table.readAt, table.createdAt),
]);

export type UserMessage = typeof userMessages.$inferSelect;
