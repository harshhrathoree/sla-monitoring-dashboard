import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load .env.local for local `drizzle-kit push` / `drizzle-kit migrate` runs.
// In CI / Vercel the DATABASE_URL is already in the environment.
dotenv.config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for drizzle-kit");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Verbose logging so we can see what SQL drizzle-kit generates
  verbose: true,
  strict: true,
} satisfies Config;
