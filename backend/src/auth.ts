import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { Router } from "express";
import type {
  CookieOptions,
  RequestHandler,
} from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { Config } from "./config.js";

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  role: "user" | "admin";
}

interface SessionUserRow extends RowDataPacket {
  id: string;
  email: string;
  role: "user" | "admin";
}

const SESSION_SECONDS = 60 * 60;

const credentialsSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
});

// Login allows existing accounts with shorter seeded passwords.
const loginSchema = credentialsSchema.extend({
  password: z.string().min(1).max(128),
});

const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

export async function createAuthRouter(
  pool: Pool,
  config: Config,
) {
  const router = Router();
  const key = new TextEncoder().encode(config.JWT_SECRET);

  const cookieName =
    config.NODE_ENV === "production"
      ? "__Host-q2a_session"
      : "q2a_session";

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: config.COOKIE_SAME_SITE,
    partitioned: config.COOKIE_PARTITIONED,
    path: "/",
  };

  // Unknown emails still perform password verification.
  const dummyHash = await hashPassword(randomUUID());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many attempts. Try again in 15 minutes.",
    },
  });

  const authenticate: RequestHandler = async (req, res, next) => {
    const token: unknown = req.cookies?.[cookieName];

    if (typeof token !== "string") {
      res.status(401).json({ error: "Please log in." });
      return;
    }

    let userId: string;
    let sessionId: string;

    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ["HS256"],
        issuer: "prjs5-api",
        audience: "prjs5-client",
        requiredClaims: ["sub", "jti", "exp", "iat"],
      });

      if (!payload.sub || !payload.jti) {
        throw new Error("Missing session claims.");
      }

      userId = payload.sub;
      sessionId = payload.jti;
    } catch {
      res.clearCookie(cookieName, cookieOptions);
      res.status(401).json({
        error: "Session expired or invalid. Please log in.",
      });
      return;
    }

    const [users] = await pool.execute<SessionUserRow[]>(
      `SELECT u.id, u.email, u.role
       FROM sessions AS s
       JOIN users AS u ON u.id = s.user_id
       WHERE s.id = ?
         AND s.user_id = ?
         AND s.expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [sessionId, userId],
    );

    const user = users[0];

    if (!user) {
      res.clearCookie(cookieName, cookieOptions);
      res.status(401).json({ error: "Please log in again." });
      return;
    }

    res.locals.user = user;
    res.locals.sessionId = sessionId;
    next();
  };

  // POST /api/auth/register
  router.post("/register", authLimiter, async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Use a valid email and a password of 12–128 characters.",
      });
      return;
    }

    const { email, password } = parsed.data;
    const id = randomUUID();
    const passwordHash = await hashPassword(password);

    try {
      await pool.execute(
        `INSERT INTO users (id, email, password_hash, role)
         VALUES (?, ?, ?, 'user')`,
        [id, email, passwordHash],
      );
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ER_DUP_ENTRY"
      ) {
        res.status(409).json({
          error: "An account with that email already exists.",
        });
        return;
      }

      throw error;
    }

    res.status(201).json({
      message: "Account created. You can now log in.",
      user: { id, email, role: "user" },
    });
  });

  // POST /api/auth/login
  router.post("/login", authLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Enter a valid email and password.",
      });
      return;
    }

    const { email, password } = parsed.data;

    const [users] = await pool.execute<UserRow[]>(
      `SELECT id, email, password_hash, role
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email],
    );

    const user = users[0];

    const validPassword = await argon2.verify(
      user?.password_hash ?? dummyHash,
      password,
    );

    if (!user || !validPassword) {
      res.status(401).json({
        error: "Incorrect email or password.",
      });
      return;
    }

    const sessionId = randomUUID();

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setJti(sessionId)
      .setIssuer("prjs5-api")
      .setAudience("prjs5-client")
      .setIssuedAt()
      .setExpirationTime(`${SESSION_SECONDS}s`)
      .sign(key);

    await pool.execute(
      `INSERT INTO sessions (id, user_id, expires_at)
       VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR))`,
      [sessionId, user.id],
    );

    res.cookie(cookieName, token, {
      ...cookieOptions,
      maxAge: SESSION_SECONDS * 1000,
    });

    res.json({
      message: "Logged in.",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  });

  // GET /api/auth/me
  router.get("/me", authenticate, (_req, res) => {
    res.json({ user: res.locals.user });
  });

  // POST /api/auth/logout
  router.post("/logout", authenticate, async (_req, res) => {
    await pool.execute(
      "DELETE FROM sessions WHERE id = ?",
      [res.locals.sessionId],
    );

    res.clearCookie(cookieName, cookieOptions);
    res.json({ message: "Logged out." });
  });

  return { router, authenticate };
}