import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function getDb() {
  if (!env.DB) {
    throw new Error(
      'The local D1 binding `DB` is unavailable. Check the TRACE database configuration before using the database.',
    );
  }

  return drizzle(env.DB, { schema });
}
