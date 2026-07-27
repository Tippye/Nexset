import { drizzle } from 'drizzle-orm/sqlite-proxy';
import * as SQLite from 'expo-sqlite';

import { SEED_EXERCISES } from '@/data/exercises';

import { runMigrations } from './migrations';
import { ensureDeviceId } from './oplog';
import { seedExercises } from './repositories/exercise-repo';
import { getSetting, setSetting } from './repositories/settings-repo';
import * as schema from './schema';
import type { DB } from './types';

let db: DB | null = null;
const EXERCISE_SEED_VERSION = 2;

export async function initDatabase(): Promise<DB> {
  if (db) return db;
  const sqlite = await SQLite.openDatabaseAsync('nexset.db');
  await sqlite.execAsync('PRAGMA journal_mode = WAL');
  await runMigrations({
    exec: (sql) => sqlite.execAsync(sql),
    scalar: async (sql) => {
      const row = await sqlite.getFirstAsync<Record<string, number>>(sql);
      return row ? Number(Object.values(row)[0]) : 0;
    },
  });
  // The default Drizzle Expo driver executes synchronous SQLite calls. On web
  // those calls cross a SharedArrayBuffer worker bridge and can time out under
  // ordinary repository reads. sqlite-proxy keeps Drizzle's query builder while
  // routing every operation through expo-sqlite's asynchronous API.
  const database = drizzle(
    async (query, params, method) => {
      if (method === 'run') {
        await sqlite.runAsync(query, params as SQLite.SQLiteBindParams);
        return { rows: [] };
      }
      const result = await sqlite.getAllAsync<Record<string, unknown>>(
        query,
        params as SQLite.SQLiteBindParams,
      );
      const values = result.map((row) => Object.values(row));
      return { rows: method === 'get' ? (values[0] ?? []) : values };
    },
    { schema },
  ) as unknown as DB;
  await ensureDeviceId(database);
  const seedVersion = await getSetting<number>(database, 'exercise_seed_version');
  if (seedVersion !== EXERCISE_SEED_VERSION) {
    // Versioned upsert repairs historical seed rows without touching custom actions.
    await seedExercises(database, SEED_EXERCISES);
    await setSetting(database, 'exercise_seed_version', EXERCISE_SEED_VERSION);
  }
  db = database;
  return db;
}

/** Throws if called before initDatabase resolves (root layout gates on it). */
export function getDb(): DB {
  if (!db) throw new Error('Database not initialized');
  return db;
}
