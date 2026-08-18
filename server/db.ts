import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { cloudLedgers, type CloudLedger, type InsertUser, users } from "../drizzle/schema";
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
