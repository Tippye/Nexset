import { eq } from 'drizzle-orm';

import { logOp } from '../oplog';
import { settings } from '../schema';
import type { DB } from '../types';

/** Keys that sync across devices; everything else (device_id, secrets refs) stays local. */
const SYNCED_KEYS = new Set(['nutrition_targets', 'preferences', 'onboarding_done']);

export async function getSetting<T>(db: DB, key: string): Promise<T | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  return rows.length ? (JSON.parse(rows[0].value) as T) : null;
}

export async function setSetting(db: DB, key: string, value: unknown): Promise<void> {
  const now = Date.now();
  const serialized = JSON.stringify(value);
  await db
    .insert(settings)
    .values({ key, value: serialized, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: serialized, updatedAt: now } });
  if (SYNCED_KEYS.has(key)) {
    await logOp(db, 'settings', key, 'put', { key, value: serialized, updatedAt: now });
  }
}
