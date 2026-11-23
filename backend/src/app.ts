import express from "express";
import type { ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import type { Pool } from "mysql2/promise";
import type { Config } from "./config.js";
import { createAuthRouter } from "./auth.js";
import { createQuestionsRouter } from "./questions.js";

export async function createApp(pool: Pool, config: Config) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", config.TRUST_PROXY_HOPS);

  app.use(helmet());

  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Requested-With"],
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Protect mutation requests against cross-site submissions.
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }

    if (
      req.get("Origin") !== config.CLIENT_ORIGIN ||
      req.get("X-Requested-With") !== "Q2AClient"
    ) {
      res.status(403).json({
        error: "Request origin or security header is invalid.",
      });
      return;
    }

    if (!req.is("application/json")) {
      res.status(415).json({
        error: "Use Content-Type: application/json.",
      });
      return;
    }

    next();
  });

  app.use(express.json({ limit: "16kb" }));
  app.use(cookieParser());

  app.get("/health", async (_req, res) => {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });
  });

  const auth = await createAuthRouter(pool, config);

app.use("/api/auth", auth.router);

app.use(
  "/api/questions",
  auth.authenticate,
  createQuestionsRouter(pool),
);

  app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });

  const handleError: ErrorRequestHandler = (
    error,
    _req,
    res,
    _next,
  ) => {
    const status: unknown = error?.status;

    if (
      typeof status === "number" &&
      status >= 400 &&
      status < 500
    ) {
      res.status(status).json({
        error: "Invalid request or JSON body.",
      });
      return;
    }

    // Log a code/name without logging passwords or request bodies.
    console.error(
      "Request failed:",
      error?.code ?? error?.name ?? "Unknown error",
    );

    res.status(500).json({
      error: "An internal server error occurred.",
    });
  };

  app.use(handleError);

  return app;
}