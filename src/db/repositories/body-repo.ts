import { desc, eq, gte, and } from 'drizzle-orm';

import { localDate, newId } from '@/lib/id';

import { logOp } from '../oplog';
import { bodyMetrics } from '../schema';
import type { DB } from '../types';

export type BodyMetricKind =
  | 'weight_kg'
  | 'waist_cm'
  | 'chest_cm'
  | 'arm_cm'
  | 'thigh_cm'
  | 'hip_cm'
  | 'body_fat_pct';

export async function addBodyMetric(
  db: DB,
  metric: BodyMetricKind,
  value: number,
  date?: string,
): Promise<string> {
  const row = {
    id: newId(),
    date: date ?? localDate(),
    metric,
    value,
    createdAt: Date.now(),
  };
  await db.insert(bodyMetrics).values(row);
  await logOp(db, 'body_metrics', row.id, 'put', row);
  return row.id;
}

export async function getMetricHistory(db: DB, metric: BodyMetricKind, sinceDate?: string) {
  const conds = [eq(bodyMetrics.metric, metric)];
  if (sinceDate) conds.push(gte(bodyMetrics.date, sinceDate));
  return db
    .select()
    .from(bodyMetrics)
    .where(and(...conds))
    .orderBy(desc(bodyMetrics.date), desc(bodyMetrics.createdAt));
}

export async function getLatestMetric(
  db: DB,
  metric: BodyMetricKind,
): Promise<{ date: string; value: number } | null> {
  const rows = await db
    .select()
    .from(bodyMetrics)
    .where(eq(bodyMetrics.metric, metric))
    .orderBy(desc(bodyMetrics.date), desc(bodyMetrics.createdAt))
    .limit(1);
  return rows.length ? { date: rows[0].date, value: rows[0].value } : null;
}
