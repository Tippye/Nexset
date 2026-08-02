import { and, desc, eq, lte } from 'drizzle-orm';

import { syncInbox, syncOplog } from '@/db/schema';
import type { DB } from '@/db/types';

export type SyncOperation = {
  opId: string;
  deviceId: string;
  tableName: string;
  rowId: string;
  op: 'put' | 'delete';
  payloadJson: string | null;
  ts: number;
};

export type WebDavSyncTransport = {
  /** Upload local operations and return remote operations from the WebDAV journal. */
  exchange: (outgoing: SyncOperation[]) => Promise<SyncOperation[]>;
};

export type RemoteOperationApplier = (operation: SyncOperation) => Promise<void>;

export type SyncRunResult = {
  uploaded: number;
  downloaded: number;
  applied: number;
  duplicates: number;
  conflictsWonByLocal: number;
};

export async function runWebDavSync(
  db: DB,
  transport: WebDavSyncTransport,
  applyRemote: RemoteOperationApplier,
  options: { now?: number; limit?: number } = {},
): Promise<SyncRunResult> {
  const now = options.now ?? Date.now();
  const pending = await db
    .select()
    .from(syncOplog)
    .where(and(eq(syncOplog.synced, false), lte(syncOplog.nextAttemptAt, now)))
    .orderBy(syncOplog.seq)
    .limit(options.limit ?? 200);
  const outgoing = pending.map(toSyncOperation);

  let remote: SyncOperation[] = [];
  let inbound: Pick<SyncRunResult, 'applied' | 'duplicates' | 'conflictsWonByLocal'>;
  try {
    remote = dedupeOperations(await transport.exchange(outgoing));
    inbound = await applyRemoteOperations(db, remote, applyRemote);
  } catch (error) {
    const message = safeErrorMessage(error);
    for (const row of pending) {
      const attemptCount = row.attemptCount + 1;
      await db
        .update(syncOplog)
        .set({
          attemptCount,
          nextAttemptAt: nextRetryAt(attemptCount, now),
          lastError: message,
        })
        .where(eq(syncOplog.seq, row.seq));
    }
    throw error;
  }

  for (const row of pending) {
    await db
      .update(syncOplog)
      .set({ synced: true, lastError: null, nextAttemptAt: 0 })
      .where(eq(syncOplog.seq, row.seq));
  }
  return {
    uploaded: outgoing.length,
    downloaded: remote.length,
    ...inbound,
  };
}

export async function applyRemoteOperations(
  db: DB,
  operations: SyncOperation[],
  applyRemote: RemoteOperationApplier,
): Promise<Pick<SyncRunResult, 'applied' | 'duplicates' | 'conflictsWonByLocal'>> {
  let applied = 0;
  let duplicates = 0;
  let conflictsWonByLocal = 0;

  for (const operation of dedupeOperations(operations)) {
    const inserted = await db
      .insert(syncInbox)
      .values({
        ...operation,
        appliedAt: Date.now(),
      })
      .onConflictDoNothing({ target: syncInbox.opId })
      .returning({ opId: syncInbox.opId });
    if (!inserted.length) {
      duplicates += 1;
      continue;
    }

    const [local] = await db
      .select()
      .from(syncOplog)
      .where(
        and(
          eq(syncOplog.tableName, operation.tableName),
          eq(syncOplog.rowId, operation.rowId),
        ),
      )
      .orderBy(desc(syncOplog.ts), desc(syncOplog.seq))
      .limit(1);
    if (local && compareVersions(toSyncOperation(local), operation) >= 0) {
      conflictsWonByLocal += 1;
      continue;
    }
    try {
      await applyRemote(operation);
      applied += 1;
    } catch (error) {
      await db.delete(syncInbox).where(eq(syncInbox.opId, operation.opId));
      throw error;
    }
  }
  return { applied, duplicates, conflictsWonByLocal };
}

export function dedupeOperations(operations: SyncOperation[]): SyncOperation[] {
  const byId = new Map<string, SyncOperation>();
  for (const operation of operations) {
    const current = byId.get(operation.opId);
    if (!current || compareVersions(operation, current) > 0) byId.set(operation.opId, operation);
  }
  return [...byId.values()];
}

/** Last-write-wins with deterministic device/op tie breakers. */
export function compareVersions(left: SyncOperation, right: SyncOperation): number {
  return (
    left.ts - right.ts ||
    left.deviceId.localeCompare(right.deviceId) ||
    left.opId.localeCompare(right.opId)
  );
}

export function nextRetryAt(attemptCount: number, now = Date.now()): number {
  const delay = Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, attemptCount - 1));
  return now + delay;
}

function toSyncOperation(row: typeof syncOplog.$inferSelect): SyncOperation {
  return {
    opId: `${row.deviceId}:${row.seq}`,
    deviceId: row.deviceId,
    tableName: row.tableName,
    rowId: row.rowId,
    op: row.op === 'delete' ? 'delete' : 'put',
    payloadJson: row.payloadJson,
    ts: row.ts,
  };
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'WebDAV 同步失败';
  return message.slice(0, 300);
}
