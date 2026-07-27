import { MIGRATIONS } from './migrations.generated';

export type SqlExecutor = {
  /** Execute one SQL statement (no result needed). */
  exec: (sql: string) => Promise<void> | void;
  /** Return a single scalar from a query like `PRAGMA user_version`. */
  scalar: (sql: string) => Promise<number> | number;
};

/**
 * Applies pending migrations, tracking progress in PRAGMA user_version
 * (the number of applied migrations). Works against any SQLite driver
 * through the SqlExecutor adapter.
 */
export async function runMigrations(executor: SqlExecutor): Promise<number> {
  const applied = Number(await executor.scalar('PRAGMA user_version')) || 0;
  let count = 0;
  for (let i = applied; i < MIGRATIONS.length; i++) {
    for (const statement of MIGRATIONS[i].statements) {
      await executor.exec(statement);
    }
    await executor.exec(`PRAGMA user_version = ${i + 1}`);
    count++;
  }
  return count;
}
