export const MESSAGE_LEVELS = ["safety", "important", "update", "info"] as const;
export type MessageLevel = (typeof MESSAGE_LEVELS)[number];

export const MESSAGE_ACTION_PATHS = ["/", "/?tab=home", "/?tab=products", "/?tab=business", "/?tab=profile"] as const;
export type MessageActionPath = (typeof MESSAGE_ACTION_PATHS)[number];

export function isMessageActionPath(value: string | null | undefined): value is MessageActionPath {
  return Boolean(value && (MESSAGE_ACTION_PATHS as readonly string[]).includes(value));
}

export function canManageMessages(role: string | null | undefined) {
  return role === "admin";
}

export function isMessageExpired(expiresAt: Date | null | undefined, now = new Date()) {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

export function getMessageLevelLabel(level: MessageLevel) {
  return { safety: "账本安全", important: "重要公告", update: "产品更新", info: "服务消息" }[level];
}
