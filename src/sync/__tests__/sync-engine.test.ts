import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { logOp } from '@/db/oplog';
import { syncInbox, syncOplog } from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import type { DB } from '@/db/types';

import { applyRemoteOperations, runWebDavSync, type SyncOperation } from '../sync-engine';

describe('SQLite/WebDAV sync engine', () => {
  let db: DB;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('resolves same-row conflicts deterministically and keeps the newer local write', async () => {
    await logOp(db, 'settings', 'preferences', 'put', { theme: 'dark' });
    const [local] = await db.select().from(syncOplog);
    const remote = operation({
      opId: 'remote:1',
      deviceId: 'remote',
      ts: local.ts - 1,
      payloadJson: JSON.stringify({ theme: 'light' }),
    });
    const apply = jest.fn(async () => undefined);

    const result = await applyRemoteOperations(db, [remote], apply);

    expect(result.conflictsWonByLocal).toBe(1);
    expect(apply).not.toHaveBeenCalled();
    expect(await db.select().from(syncInbox)).toHaveLength(1);
  });

  it('applies the remote write when it wins the SQLite/WebDAV conflict', async () => {
    await logOp(db, 'settings', 'preferences', 'put', { theme: 'dark' });
    const [local] = await db.select().from(syncOplog);
    const remote = operation({ opId: 'remote:newer', ts: local.ts + 1 });
    const apply = jest.fn(async () => undefined);

    const result = await applyRemoteOperations(db, [remote], apply);

    expect(result).toMatchObject({ applied: 1, conflictsWonByLocal: 0 });
    expect(apply).toHaveBeenCalledWith(remote);
  });

  it('keeps failed uploads offline and retries them after exponential backoff', async () => {
    await logOp(db, 'settings', 'preferences', 'put', { theme: 'dark' });
    const now = 1_700_000_000_000;
    const failing = { exchange: jest.fn(async () => Promise.reject(new Error('offline'))) };

    await expect(runWebDavSync(db, failing, async () => undefined, { now })).rejects.toThrow(
      'offline',
    );
    let [queued] = await db.select().from(syncOplog);
    expect(queued).toMatchObject({ synced: false, attemptCount: 1, lastError: 'offline' });
    expect(queued.nextAttemptAt).toBe(now + 5_000);

    const recovered = { exchange: jest.fn(async () => []) };
    const result = await runWebDavSync(db, recovered, async () => undefined, {
      now: queued.nextAttemptAt,
    });
    [queued] = await db.select().from(syncOplog);
    expect(result.uploaded).toBe(1);
    expect(queued.synced).toBe(true);
  });

  it('applies a duplicated remote operation only once', async () => {
    const remote = operation({ opId: 'remote:duplicate', deviceId: 'remote', ts: Date.now() + 100 });
    const apply = jest.fn(async () => undefined);

    await applyRemoteOperations(db, [remote], apply);
    const second = await applyRemoteOperations(db, [remote], apply);

    expect(apply).toHaveBeenCalledTimes(1);
    expect(second.duplicates).toBe(1);
    expect(await db.select().from(syncInbox).where(eq(syncInbox.opId, remote.opId))).toHaveLength(1);
  });
});

function operation(overrides: Partial<SyncOperation>): SyncOperation {
  return {
    opId: 'remote:1',
    deviceId: 'remote',
    tableName: 'settings',
    rowId: 'preferences',
    op: 'put',
    payloadJson: JSON.stringify({ theme: 'light' }),
    ts: Date.now(),
    ...overrides,
  };
}
