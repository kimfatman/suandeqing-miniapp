import axios from "axios";
import { parse as parseCookie } from "cookie";
import { SignJWT, jwtVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS, decodeOAuthState } from "@shared/const";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

type TokenResponse = { accessToken: string };
type OAuthUser = { openId: string; name?: string | null; email?: string | null; platform?: string | null; loginMethod?: string | null };

const client = axios.create({ baseURL: ENV.oAuthServerUrl, timeout: 30_000 });
const encoder = new TextEncoder();

export const sdk = {
  async exchangeCodeForToken(code: string, state: string) {
    const { redirectUri } = decodeOAuthState(state);
    const { data } = await client.post<TokenResponse>("/webdev.v1.WebDevAuthPublicService/ExchangeToken", {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri,
    });
    return data;
  },
  async getUserInfo(accessToken: string) {
    const { data } = await client.post<OAuthUser>("/webdev.v1.WebDevAuthPublicService/GetUserInfo", { accessToken });
    return data;
  },
  async createSessionToken(openId: string, name: string) {
    const expiresAt = Math.floor((Date.now() + ONE_YEAR_MS) / 1000);
    return new SignJWT({ openId, appId: ENV.appId, name })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expiresAt)
      .sign(encoder.encode(ENV.cookieSecret));
  },
  async authenticateRequest(cookieHeader: string | undefined): Promise<User | null> {
    const token = parseCookie(cookieHeader ?? "")[COOKIE_NAME];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, encoder.encode(ENV.cookieSecret), { algorithms: ["HS256"] });
      const openId = typeof payload.openId === "string" ? payload.openId : "";
      if (!openId) return null;
      return (await db.getUserByOpenId(openId)) ?? null;
    } catch {
      return null;
    }
  },
};
