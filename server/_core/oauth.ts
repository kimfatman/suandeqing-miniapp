import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, decodeOAuthState } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const expectedNonce = parseCookie(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    const { nonce } = decodeOAuthState(state);
    if (!code || !state || !nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", sameSite: "none", secure: true });
    try {
      const token = await sdk.exchangeCodeForToken(code, state);
      const user = await sdk.getUserInfo(token.accessToken);
      if (!user.openId) throw new Error("OAuth user openId is missing");
      await db.upsertUser({ openId: user.openId, name: user.name ?? null, email: user.email ?? null, loginMethod: user.loginMethod ?? user.platform ?? null, lastSignedIn: new Date() });
      const session = await sdk.createSessionToken(user.openId, user.name ?? "");
      res.cookie(COOKIE_NAME, session, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
