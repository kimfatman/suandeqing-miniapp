import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { sdk } from "./sdk";

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const user = await sdk.authenticateRequest(req.headers.cookie);
  return { req, res, user };
}

export type TrpcContext = Awaited<ReturnType<typeof createContext>>;
