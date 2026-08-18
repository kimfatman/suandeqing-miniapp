import type { CookieOptions, Request } from "express";

const isSecureRequest = (req: Request) => {
  if (req.protocol === "https") return true;
  const forwarded = req.headers["x-forwarded-proto"];
  const values = Array.isArray(forwarded) ? forwarded : typeof forwarded === "string" ? forwarded.split(",") : [];
  return values.some((value) => value.trim().toLowerCase() === "https");
};

export const getSessionCookieOptions = (req: Request): Pick<CookieOptions, "httpOnly" | "path" | "sameSite" | "secure"> => ({
  httpOnly: true,
  path: "/",
  sameSite: "none",
  secure: isSecureRequest(req),
});
