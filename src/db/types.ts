import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type * as schema from './schema';

/**
 * Driver-agnostic database handle: expo-sqlite (async) in the app,
 * better-sqlite3 (sync) in Jest. Repositories `await` everything, which
 * is a no-op for sync drivers.
 */
export type DB = BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>;
