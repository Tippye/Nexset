import { and, desc, eq } from 'drizzle-orm';

import { localDate, newId } from '@/lib/id';

import { logOp } from '../oplog';
import { setLogs, workoutSessions } from '../schema';
import type { DB } from '../types';

export type SetLogInput = {
  exerciseId: string;
  setNo: number;
  weightKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  rpe?: number | null;
  isWarmup?: boolean;
  source?: 'manual' | 'watch_manual' | 'watch_auto' | 'chat';
  confidence?: number | null;
  status?: 'confirmed' | 'pending';
};

export type SetLog = Required<Pick<SetLogInput, 'exerciseId' | 'setNo'>> & {
  id: string;
  sessionId: string;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceM: number | null;
  rpe: number | null;
  isWarmup: boolean;
  source: string;
  confidence: number | null;
  status: string;
  createdAt: number;
};

export async function startSession(
  db: DB,
  opts: { planId?: string; planDayId?: string; date?: string } = {},
): Promise<string> {
  const now = Date.now();
  const row = {
    id: newId(),
    date: opts.date ?? localDate(),
    planId: opts.planId ?? null,
    planDayId: opts.planDayId ?? null,
    startedAt: now,
    endedAt: null,
    note: null,
    feeling: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(workoutSessions).values(row);
  await logOp(db, 'workout_sessions', row.id, 'put', row);
  return row.id;
}

export async function endSession(
  db: DB,
  sessionId: string,
  opts: { note?: string; feeling?: 'great' | 'ok' | 'tired' | 'bad' } = {},
): Promise<void> {
  const now = Date.now();
  await db
    .update(workoutSessions)
    .set({ endedAt: now, note: opts.note ?? null, feeling: opts.feeling ?? null, updatedAt: now })
    .where(eq(workoutSessions.id, sessionId));
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  if (rows.length) await logOp(db, 'workout_sessions', sessionId, 'put', rows[0]);
}

export async function updateSessionFeedback(
  db: DB,
  sessionId: string,
  opts: { note?: string; feeling?: 'great' | 'ok' | 'tired' | 'bad' },
): Promise<void> {
  const now = Date.now();
  await db
    .update(workoutSessions)
    .set({ note: opts.note ?? null, feeling: opts.feeling ?? null, updatedAt: now })
    .where(eq(workoutSessions.id, sessionId));
  const rows = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.id, sessionId))
    .limit(1);
  if (rows.length) await logOp(db, 'workout_sessions', sessionId, 'put', rows[0]);
}

export async function addSetLog(db: DB, sessionId: string, input: SetLogInput): Promise<SetLog> {
  const row = {
    id: newId(),
    sessionId,
    exerciseId: input.exerciseId,
    setNo: input.setNo,
    weightKg: input.weightKg ?? null,
    reps: input.reps ?? null,
    durationSec: input.durationSec ?? null,
    distanceM: input.distanceM ?? null,
    rpe: input.rpe ?? null,
    isWarmup: input.isWarmup ?? false,
    source: input.source ?? 'manual',
    confidence: input.confidence ?? null,
    status: input.status ?? 'confirmed',
    createdAt: Date.now(),
  };
  await db.insert(setLogs).values(row);
  await logOp(db, 'set_logs', row.id, 'put', row);
  return row as SetLog;
}

export async function updateSetLog(
  db: DB,
  setLogId: string,
  patch: Partial<Pick<SetLogInput, 'weightKg' | 'reps' | 'durationSec' | 'rpe' | 'status'>>,
): Promise<void> {
  await db.update(setLogs).set(patch).where(eq(setLogs.id, setLogId));
  const rows = await db.select().from(setLogs).where(eq(setLogs.id, setLogId)).limit(1);
  if (rows.length) await logOp(db, 'set_logs', setLogId, 'put', rows[0]);
}

export async function deleteSetLog(db: DB, setLogId: string): Promise<void> {
  await db.delete(setLogs).where(eq(setLogs.id, setLogId));
  await logOp(db, 'set_logs', setLogId, 'delete');
}

export async function getSessionSets(db: DB, sessionId: string): Promise<SetLog[]> {
  const rows = await db
    .select()
    .from(setLogs)
    .where(eq(setLogs.sessionId, sessionId))
    .orderBy(setLogs.createdAt, setLogs.id);
  return rows as SetLog[];
}

export async function getSessionsByDate(db: DB, date: string) {
  return db.select().from(workoutSessions).where(eq(workoutSessions.date, date));
}

export async function getRecentSessions(db: DB, limit: number) {
  return db
    .select()
    .from(workoutSessions)
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit);
}

/** Last confirmed working sets for an exercise (for "上次数据" display). */
export async function getLastSetsForExercise(
  db: DB,
  exerciseId: string,
  opts: { excludeSessionId?: string } = {},
): Promise<SetLog[]> {
  const conds = [eq(setLogs.exerciseId, exerciseId), eq(setLogs.status, 'confirmed')];
  const rows = await db
    .select()
    .from(setLogs)
    .where(and(...conds))
    .orderBy(desc(setLogs.createdAt), desc(setLogs.id))
    .limit(60);
  const bySession = new Map<string, SetLog[]>();
  for (const r of rows as SetLog[]) {
    if (opts.excludeSessionId && r.sessionId === opts.excludeSessionId) continue;
    const list = bySession.get(r.sessionId) ?? [];
    list.push(r);
    bySession.set(r.sessionId, list);
  }
  const first = bySession.values().next();
  if (first.done) return [];
  return first.value.sort((a, b) => a.setNo - b.setNo);
}

/** Historical bests for PR detection: max weight and max estimated 1RM (Epley). */
export async function getExerciseBests(
  db: DB,
  exerciseId: string,
  opts: { excludeSessionId?: string } = {},
): Promise<{ maxWeightKg: number | null; maxE1rm: number | null }> {
  const rows = await db
    .select()
    .from(setLogs)
    .where(and(eq(setLogs.exerciseId, exerciseId), eq(setLogs.status, 'confirmed')));
  let maxWeightKg: number | null = null;
  let maxE1rm: number | null = null;
  for (const r of rows as SetLog[]) {
    if (opts.excludeSessionId && r.sessionId === opts.excludeSessionId) continue;
    if (r.isWarmup || r.weightKg == null) continue;
    if (maxWeightKg == null || r.weightKg > maxWeightKg) maxWeightKg = r.weightKg;
    if (r.reps != null && r.reps > 0) {
      const e1rm = r.weightKg * (1 + r.reps / 30);
      if (maxE1rm == null || e1rm > maxE1rm) maxE1rm = e1rm;
    }
  }
  return { maxWeightKg, maxE1rm };
}
