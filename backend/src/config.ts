import "dotenv/config";
import { z } from "zod";

const booleanSetting = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3000),

  CLIENT_ORIGIN: z.url(),

  DB_HOST: z.string().min(1),

  DB_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(3306),

  DB_NAME: z.string().min(1),

  DB_USER: z.string().min(1),

  DB_PASSWORD: z.string().min(1),

  DB_TLS: booleanSetting.default(false),

  DB_CA_FILE: z.string().optional(),
  
  JWT_SECRET: z.string().min(32),

COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),

COOKIE_PARTITIONED: z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true"),

TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env
) {
  const config = environmentSchema.parse(environment);

  const clientUrl = new URL(config.CLIENT_ORIGIN);

  if (clientUrl.origin !== config.CLIENT_ORIGIN) {
    throw new Error(
      "CLIENT_ORIGIN must contain only the scheme, hostname, and port."
    );
  }

  if (
    config.NODE_ENV === "production" &&
    clientUrl.protocol !== "https:"
  ) {
    throw new Error(
      "The production frontend must use HTTPS."
    );
  }

  return config;
}

export type Config = ReturnType<typeof readConfig>;