import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { runMigrations } from './migrations';
import { __resetDeviceIdCache } from './oplog';
import type { DB } from './types';

/** In-memory SQLite database with all migrations applied (Jest only). */
export async function createTestDb(): Promise<DB> {
  const sqlite = new Database(':memory:');
  await runMigrations({
    exec: (sql) => {
      sqlite.exec(sql);
    },
    scalar: (sql) => {
      const row = sqlite.prepare(sql).get() as Record<string, number> | undefined;
      return row ? Number(Object.values(row)[0]) : 0;
    },
  });
  __resetDeviceIdCache();
  return drizzle(sqlite) as unknown as DB;
}
