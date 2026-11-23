import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { RowDataPacket } from "mysql2/promise";
import { hashPassword } from "../src/auth.js";
import { readConfig } from "../src/config.js";
import { createPool } from "../src/db.js";

function demoPassword(name: string) {
  const password = process.env[name];
  if (!password || password.length > 128) {
    throw new Error(`Set ${name} to the password for that demo account.`);
  }
  return password;
}

const accounts = [
  { email: "john@john.com", role: "user", password: demoPassword("DEMO_USER_PASSWORD") },
  { email: "admin@admin.com", role: "admin", password: demoPassword("DEMO_ADMIN_PASSWORD") },
];
const pool = createPool(readConfig());

try {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const { email, role, password } of accounts) {
      const hash = await hashPassword(password);
      await connection.execute(
        `INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = id`,
        [randomUUID(), email, hash, role],
      );

      const [[user]] = await connection.execute<RowDataPacket[]>(
        "SELECT role, password_hash FROM users WHERE email = ?",
        [email],
      );
      if (user?.role !== role || !(await argon2.verify(user.password_hash, password))) {
        throw new Error(`The existing account for ${email} has a different role or password.`);
      }
    }

    await connection.commit();
    console.log("Demo accounts are ready.");
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
} finally {
  await pool.end();
}
