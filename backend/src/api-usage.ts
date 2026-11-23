import type { Pool } from "mysql2/promise";

// Call once after an authenticated AI request has an outcome.
// Use the route pattern as the endpoint, without the query string.
export async function recordApiUsage(
  pool: Pool,
  userId: string,
  endpoint: string,
  statusCode: number,
) {
  await pool.execute(
    `INSERT INTO api_usage (user_id, endpoint, status_code)
     VALUES (?, ?, ?)`,
    [userId, endpoint, statusCode],
  );
}
