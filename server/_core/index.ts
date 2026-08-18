import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerOAuthRoutes } from "./oauth";
import { serveStatic, setupVite } from "./vite";

const findAvailablePort = async (start: number) => new Promise<number>((resolve, reject) => {
  const probe = net.createServer();
  probe.listen(start, () => probe.close(() => resolve(start)));
  probe.once("error", () => reject(new Error(`Port ${start} is unavailable`)));
});

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "2mb" }));
  registerOAuthRoutes(app);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);
  const port = await findAvailablePort(Number(process.env.PORT ?? 3000));
  server.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

startServer().catch((error) => { console.error(error); process.exit(1); });
