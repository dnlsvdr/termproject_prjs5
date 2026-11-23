import { Router } from "express";
import type { Pool, RowDataPacket } from "mysql2/promise";

interface RegisteredUser extends RowDataPacket {
  email: string;
  role: "user" | "admin";
  registeredOn: string;
}

interface UsageTotal extends RowDataPacket {
  totalRequests: number;
}

export function createAdminRouter(pool: Pool) {
  const router = Router();

  router.use((_req, res, next) => {
    if (res.locals.user?.role !== "admin") {
      res.status(403).json({ error: "Administrator access is required." });
      return;
    }

    next();
  });

  router.get("/users", async (_req, res) => {
    const [users] = await pool.query<RegisteredUser[]>(`
      SELECT email, role, DATE_FORMAT(created_at, '%Y-%m-%d') AS registeredOn
      FROM users
      ORDER BY created_at DESC, email ASC
    `);

    res.json({ users });
  });

  router.get("/usage", async (_req, res) => {
    const [[usage]] = await pool.query<UsageTotal[]>(`
      SELECT COUNT(*) AS totalRequests FROM api_usage
    `);

    res.json({ totalRequests: Number(usage?.totalRequests ?? 0) });
  });

  return router;
}
