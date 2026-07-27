import { desc, eq, gte } from 'drizzle-orm';

import { localDate, newId } from '@/lib/id';

import { logOp } from '../oplog';
import { cardioLogs } from '../schema';
import type { DB } from '../types';

export type CardioInput = {
  sessionId?: string | null;
  date?: string;
  type: string;
  durationMin: number;
  distanceKm?: number | null;
  avgHr?: number | null;
  intensity?: 'low' | 'moderate' | 'high' | null;
  source?: 'manual' | 'health_import' | 'chat';
  externalId?: string | null;
  note?: string | null;
};

export async function addCardioLog(db: DB, input: CardioInput): Promise<string | null> {
  // Dedup health-platform imports by external id.
  if (input.externalId) {
    const existing = await db
      .select({ id: cardioLogs.id })
      .from(cardioLogs)
      .where(eq(cardioLogs.externalId, input.externalId))
      .limit(1);
    if (existing.length > 0) return null;
  }
  const row = {
    id: newId(),
    sessionId: input.sessionId ?? null,
    date: input.date ?? localDate(),
    type: input.type,
    durationMin: input.durationMin,
    distanceKm: input.distanceKm ?? null,
    avgHr: input.avgHr ?? null,
    intensity: input.intensity ?? null,
    source: input.source ?? 'manual',
    externalId: input.externalId ?? null,
    note: input.note ?? null,
    createdAt: Date.now(),
  };
  await db.insert(cardioLogs).values(row);
  await logOp(db, 'cardio_logs', row.id, 'put', row);
  return row.id;
}

export async function deleteCardioLog(db: DB, id: string): Promise<void> {
  await db.delete(cardioLogs).where(eq(cardioLogs.id, id));
  await logOp(db, 'cardio_logs', id, 'delete');
}

export async function getCardioByDate(db: DB, date: string) {
  return db.select().from(cardioLogs).where(eq(cardioLogs.date, date));
}

export async function getCardioSince(db: DB, sinceDate: string) {
  return db
    .select()
    .from(cardioLogs)
    .where(gte(cardioLogs.date, sinceDate))
    .orderBy(desc(cardioLogs.date));
}
