import { readFile } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";

import { readConfig } from "../src/config.js";
import { createPool } from "../src/db.js";

const config = readConfig();
const pool = createPool(config);
const migrations = [
  { version: "001_initial", filename: "initial.sql" },
  { version: "002_api_usage", filename: "api-usage.sql" },
];

async function migrate() {
  const connection = await pool.getConnection();

  let lockAcquired = false;

  try {
    const [lockRows] =
      await connection.query<RowDataPacket[]>(
        `
          SELECT GET_LOCK(
            'prjs5_migration',
            30
          ) AS acquired
        `
      );

    lockAcquired =
      Number(lockRows[0]?.acquired) === 1;

    if (!lockAcquired) {
      throw new Error(
        "Could not acquire the migration lock."
      );
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(100) PRIMARY KEY,

        applied_at TIMESTAMP
          NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const [applied] = await connection.query<RowDataPacket[]>(
      "SELECT version FROM schema_migrations",
    );
    const appliedVersions = new Set(applied.map((row) => row.version));
    const pending = migrations.filter(({ version }) => !appliedVersions.has(version));

    for (const { version, filename } of pending) {
      const sql = await readFile(new URL(`../sql/${filename}`, import.meta.url), "utf8");

      // Each migration contains plain CREATE TABLE statements.
      const statements = sql.split(";").map((statement) => statement.trim()).filter(Boolean);
      for (const statement of statements) {
        await connection.query(statement);
      }

      await connection.execute(
        "INSERT INTO schema_migrations (version) VALUES (?)",
        [version],
      );
      console.log(`Applied database migration: ${version}`);
    }

    if (pending.length === 0) {
      console.log("Database schema is up to date.");
    }
  } finally {
    if (lockAcquired) {
      await connection.query(
        "SELECT RELEASE_LOCK('prjs5_migration')"
      );
    }

    connection.release();
  }
}

try {
  await migrate();
} finally {
  await pool.end();
}
