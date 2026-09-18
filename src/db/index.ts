import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Returns a Drizzle db client connected to Neon.
 *
 * We create the client lazily (inside the function) rather than at module
 * load time so that Next.js can build the project without DATABASE_URL being
 * present in the build environment. The error is thrown at request time when
 * the env var is actually needed.
 */
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL environment variable is not set. " +
        "Add it to .env.local for local dev or to Vercel environment variables for production."
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

// Convenience re-export so callers can write `const db = getDb()` or use
// the named export directly.
export const db = {
  get: getDb,
};

export * from "./schema";
