export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";
export const UNAUTHED_ERR_MSG = "Please login (10001)";

export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState) => {
  const json = JSON.stringify(state);
  if (typeof window === "undefined") return Buffer.from(json, "utf8").toString("base64url");
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const decodeOAuthState = (value: string): OAuthState => {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const json = typeof window === "undefined"
      ? Buffer.from(padded, "base64").toString("utf8")
      : decodeURIComponent(escape(atob(padded)));
    const parsed = JSON.parse(json) as OAuthState;
    return typeof parsed.redirectUri === "string" ? parsed : { redirectUri: "" };
  } catch {
    return { redirectUri: "" };
  }
};
