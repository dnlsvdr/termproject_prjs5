import { readFile } from "node:fs/promises";
import type { RowDataPacket } from "mysql2/promise";

import { readConfig } from "../src/config.js";
import { createPool } from "../src/db.js";

const config = readConfig();
const pool = createPool(config);

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

    const version = "001_initial";

    const [existing] =
      await connection.execute<RowDataPacket[]>(
        `
          SELECT version
          FROM schema_migrations
          WHERE version = ?
        `,
        [version]
      );

    if (existing.length > 0) {
      console.log("Database schema is up to date.");
      return;
    }

    const sql = await readFile(
      new URL(
        "../sql/initial.sql",
        import.meta.url
      ),
      "utf8"
    );

    // This initial schema contains plain CREATE TABLE
    // statements, with no stored procedures.
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await connection.query(statement);
    }

    await connection.execute(
      `
        INSERT INTO schema_migrations (version)
        VALUES (?)
      `,
      [version]
    );

    console.log("Applied database migration: 001_initial");
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