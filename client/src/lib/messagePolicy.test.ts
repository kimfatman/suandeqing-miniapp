import { describe, expect, it } from "vitest";
import { canManageMessages, getFirstMessageOrNull, isMessageActionPath, isMessageExpired } from "@shared/messagePolicy";

describe("message policy", () => {
  it("allows only administrators to manage campaigns", () => {
    expect(canManageMessages("admin")).toBe(true);
    expect(canManageMessages("user")).toBe(false);
    expect(canManageMessages(null)).toBe(false);
  });

  it("allows only named in-app destinations for message actions", () => {
    expect(isMessageActionPath("/?tab=profile")).toBe(true);
    expect(isMessageActionPath("https://example.com")).toBe(false);
    expect(isMessageActionPath("javascript:alert(1)")).toBe(false);
  });

  it("treats the exact expiry boundary as expired", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    expect(isMessageExpired(new Date("2026-08-18T11:59:59.000Z"), now)).toBe(true);
    expect(isMessageExpired(new Date("2026-08-18T12:00:00.000Z"), now)).toBe(true);
    expect(isMessageExpired(new Date("2026-08-18T12:00:01.000Z"), now)).toBe(false);
    expect(isMessageExpired(null, now)).toBe(false);
  });

  it("returns null rather than undefined when an important-banner query has no message", () => {
    expect(getFirstMessageOrNull([])).toBeNull();
    expect(getFirstMessageOrNull([{ id: 1 }])).toEqual({ id: 1 });
  });
});
