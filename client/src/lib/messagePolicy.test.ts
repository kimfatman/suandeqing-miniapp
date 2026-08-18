import { describe, expect, it } from "vitest";
import { canManageMessages, isMessageActionPath } from "@shared/messagePolicy";

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
});
