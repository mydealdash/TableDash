import type { PoolConfig } from 'pg';

/**
 * Connection settings for Postgres. DATABASE_SSL=require turns on encryption (needed for
 * AWS Lightsail and most managed databases). Local development and tests run without it.
 */
export function pgConfig(extra: PoolConfig = {}): PoolConfig {
  const ssl = (process.env.DATABASE_SSL ?? '').toLowerCase();
  return {
    connectionString: process.env.DATABASE_URL,
    ...(ssl === 'require' || ssl === 'true' ? { ssl: { rejectUnauthorized: false } } : {}),
    ...extra,
  };
}
