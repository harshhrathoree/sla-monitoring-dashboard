import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// DATABASE_URL is injected by Vercel (from the Neon integration) or by the
// local .env.local file. We fail loudly at module load time if it is absent —
// a missing env var should never silently produce a broken DB connection.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = neon(process.env.DATABASE_URL);

// Drizzle instance shared across all API routes (each Vercel invocation gets
// its own module instance, so this is effectively per-request in serverless).
export const db = drizzle(sql, { schema });

export * from "./schema";
