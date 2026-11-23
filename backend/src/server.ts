import { readConfig } from "./config.js";
import { createPool } from "./db.js";
import { createApp } from "./app.js";

const config = readConfig();
const pool = createPool(config);

try {
  await pool.query("SELECT 1");

  const app = await createApp(pool, config);

  const server = app.listen(config.PORT, () => {
    console.log(`API running at http://localhost:${config.PORT}`);
  });

  server.requestTimeout = 60_000;
  server.headersTimeout = 65_000;

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      const timeout = setTimeout(() => process.exit(1), 10_000);
      timeout.unref();

      server.close(() => {
        void pool.end().then(() => {
          clearTimeout(timeout);
          process.exit(0);
        });
      });
    });
  }
} catch (error) {
  await pool.end();
  throw error;
}