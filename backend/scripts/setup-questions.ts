import { readConfig } from "../src/config.js";
import { createPool } from "../src/db.js";

const pool = createPool(readConfig());

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS questions (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

      INDEX idx_questions_owner (user_id, created_at),

      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log("Questions table is ready.");
} finally {
  await pool.end();
}