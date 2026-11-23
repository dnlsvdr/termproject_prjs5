import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import type { Config } from "./config.js";

export function createPool(config: Config) {
  return mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD,

    ssl: config.DB_TLS
      ? {
          rejectUnauthorized: true,

          ...(config.DB_CA_FILE
            ? {
                ca: readFileSync(
                  config.DB_CA_FILE,
                  "utf8"
                )
              }
            : {})
        }
      : undefined,

    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 100,
    connectTimeout: 10000,

    timezone: "Z",
    charset: "utf8mb4",
    dateStrings: true,
    enableKeepAlive: true,

    multipleStatements: false
  });
}