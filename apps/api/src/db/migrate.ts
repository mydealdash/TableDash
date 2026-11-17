import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'path';
import { pgConfig } from './pg-config';

async function main() {
  const pool = new Pool(pgConfig());
  await migrate(drizzle(pool), { migrationsFolder: join(__dirname, '../../drizzle') });
  await pool.end();
  console.log('Migrations applied');
}
main().catch((e) => { console.error(e); process.exit(1); });
