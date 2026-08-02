import { eq } from 'drizzle-orm';

import { newId } from '@/lib/id';

import { settings, syncOplog } from './schema';
import type { DB } from './types';

let deviceId: string | null = null;

/** Loads (or creates) the stable per-install device id used to tag oplog entries. */
export async function ensureDeviceId(db: DB): Promise<string> {
  if (deviceId) return deviceId;
  const row = await db.select().from(settings).where(eq(settings.key, 'device_id')).limit(1);
  if (row.length > 0) {
    deviceId = JSON.parse(row[0].value) as string;
  } else {
    deviceId = `dev_${newId()}`;
    await db
      .insert(settings)
      .values({ key: 'device_id', value: JSON.stringify(deviceId), updatedAt: Date.now() });
  }
  return deviceId;
}

export type OplogTable =
  | 'user_profile'
  | 'exercises'
  | 'plans'
  | 'plan_days'
  | 'planned_exercises'
  | 'plan_revisions'
  | 'workout_sessions'
  | 'set_logs'
  | 'cardio_logs'
  | 'body_metrics'
  | 'chat_sessions'
  | 'chat_messages'
  | 'settings';

/**
 * Records a write for later WebDAV sync. Payload is the full row so remote
 * peers can merge at entry granularity (P5).
 */
export async function logOp(
  db: DB,
  tableName: OplogTable,
  rowId: string,
  op: 'put' | 'delete',
  payload?: unknown,
): Promise<void> {
  const dev = await ensureDeviceId(db);
  await db.insert(syncOplog).values({
    deviceId: dev,
    tableName,
    rowId,
    op,
    payloadJson: payload === undefined ? null : JSON.stringify(payload),
    ts: Date.now(),
    synced: false,
    attemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
  });
}

/** Test-only: reset the cached device id. */
export function __resetDeviceIdCache() {
  deviceId = null;
}
