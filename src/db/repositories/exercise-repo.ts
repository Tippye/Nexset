import { and, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { newId } from '@/lib/id';

import { logOp } from '../oplog';
import { exercises } from '../schema';
import type { DB } from '../types';

export type CountingType =
  | 'weight_reps'
  | 'reps_only'
  | 'duration'
  | 'distance_duration'
  | 'assisted_weight_reps';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'cardio_machine'
  | 'other';

export type Exercise = {
  id: string;
  nameZh: string;
  nameEn: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: Equipment;
  countingType: CountingType;
  difficulty: number;
  cues: string[];
  substitutes: string[];
  contraindications: string[];
  isCustom: boolean;
};

type ExerciseRow = typeof exercises.$inferSelect;
type AsyncSQLiteClient = {
  getAllAsync: <T>(source: string, params?: unknown[]) => Promise<T[]>;
  runAsync: (source: string, params?: unknown[]) => Promise<unknown>;
  withTransactionAsync: (task: () => Promise<void>) => Promise<void>;
};

type RawExerciseRow = {
  id: string;
  name_zh: string;
  name_en: string;
  primary_muscles_json: string;
  secondary_muscles_json: string;
  equipment: string;
  counting_type: string;
  difficulty: number;
  cues_json: string;
  substitutes_json: string;
  contraindications_json: string;
  is_custom: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

function getAsyncClient(db: DB): AsyncSQLiteClient | null {
  const client = (db as DB & { $client?: Partial<AsyncSQLiteClient> }).$client;
  return client &&
    typeof client.getAllAsync === 'function' &&
    typeof client.runAsync === 'function' &&
    typeof client.withTransactionAsync === 'function'
    ? (client as AsyncSQLiteClient)
    : null;
}

function rawToExerciseRow(row: RawExerciseRow): ExerciseRow {
  return {
    id: row.id,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    primaryMusclesJson: row.primary_muscles_json,
    secondaryMusclesJson: row.secondary_muscles_json,
    equipment: row.equipment,
    countingType: row.counting_type,
    difficulty: row.difficulty,
    cuesJson: row.cues_json,
    substitutesJson: row.substitutes_json,
    contraindicationsJson: row.contraindications_json,
    isCustom: row.is_custom !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

function toExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    nameZh: r.nameZh,
    nameEn: r.nameEn,
    primaryMuscles: parseStringArray(r.primaryMusclesJson),
    secondaryMuscles: parseStringArray(r.secondaryMusclesJson),
    equipment: r.equipment as Equipment,
    countingType: r.countingType as CountingType,
    difficulty: r.difficulty,
    cues: parseStringArray(r.cuesJson),
    substitutes: parseStringArray(r.substitutesJson),
    contraindications: parseStringArray(r.contraindicationsJson),
    isCustom: r.isCustom,
  };
}

export type ExerciseFilter = {
  muscle?: string;
  equipment?: Equipment | Equipment[];
  keyword?: string;
};

export async function listExercises(db: DB, filter: ExerciseFilter = {}): Promise<Exercise[]> {
  const asyncClient = getAsyncClient(db);
  if (asyncClient) {
    const clauses = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.equipment) {
      const values = Array.isArray(filter.equipment) ? filter.equipment : [filter.equipment];
      clauses.push(`equipment IN (${values.map(() => '?').join(', ')})`);
      params.push(...values);
    }
    if (filter.muscle) {
      clauses.push('primary_muscles_json LIKE ?');
      params.push(`%"${filter.muscle}"%`);
    }
    if (filter.keyword) {
      clauses.push('(name_zh LIKE ? OR name_en LIKE ?)');
      params.push(`%${filter.keyword}%`, `%${filter.keyword}%`);
    }
    const rows = await asyncClient.getAllAsync<RawExerciseRow>(
      `SELECT * FROM exercises WHERE ${clauses.join(' AND ')}
       ORDER BY difficulty, id`,
      params,
    );
    return rows.map(rawToExerciseRow).map(toExercise);
  }

  const conds = [isNull(exercises.deletedAt)];
  if (filter.equipment) {
    const eqs = Array.isArray(filter.equipment) ? filter.equipment : [filter.equipment];
    conds.push(inArray(exercises.equipment, eqs));
  }
  if (filter.muscle) {
    conds.push(like(exercises.primaryMusclesJson, `%"${filter.muscle}"%`));
  }
  if (filter.keyword) {
    const kw = `%${filter.keyword}%`;
    const kwCond = or(like(exercises.nameZh, kw), like(exercises.nameEn, kw));
    if (kwCond) conds.push(kwCond);
  }
  // expo-sqlite's web worker has a bounded synchronous bridge payload. Fetching
  // the complete 200+ row library (including cues and substitutes) in one call
  // can time out or return a truncated bridge response, so read bounded pages.
  const rows: ExerciseRow[] = [];
  const pageSize = 32;
  for (let offset = 0; ; offset += pageSize) {
    const page = await db
      .select()
      .from(exercises)
      .where(and(...conds))
      .orderBy(exercises.difficulty, exercises.id)
      .limit(pageSize)
      .offset(offset);
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows.map(toExercise);
}

export async function getExercise(db: DB, id: string): Promise<Exercise | null> {
  const asyncClient = getAsyncClient(db);
  if (asyncClient) {
    const rows = await asyncClient.getAllAsync<RawExerciseRow>(
      'SELECT * FROM exercises WHERE id = ? LIMIT 1',
      [id],
    );
    return rows.length ? toExercise(rawToExerciseRow(rows[0])) : null;
  }
  const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
  return rows.length ? toExercise(rows[0]) : null;
}

export async function getExercisesByIds(db: DB, ids: string[]): Promise<Map<string, Exercise>> {
  if (ids.length === 0) return new Map();
  const asyncClient = getAsyncClient(db);
  if (asyncClient) {
    const rows = await asyncClient.getAllAsync<RawExerciseRow>(
      `SELECT * FROM exercises WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids,
    );
    return new Map(rows.map(rawToExerciseRow).map((row) => [row.id, toExercise(row)]));
  }
  const rows = await db.select().from(exercises).where(inArray(exercises.id, ids));
  return new Map(rows.map((r) => [r.id, toExercise(r)]));
}

export async function countExercises(db: DB): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(exercises);
  return Number(rows[0]?.n ?? 0);
}

export async function createCustomExercise(
  db: DB,
  input: Omit<Exercise, 'id' | 'isCustom' | 'substitutes' | 'contraindications'> &
    Partial<Pick<Exercise, 'substitutes' | 'contraindications'>>,
): Promise<Exercise> {
  const now = Date.now();
  const id = `custom_${newId()}`;
  const row = {
    id,
    nameZh: input.nameZh,
    nameEn: input.nameEn,
    primaryMusclesJson: JSON.stringify(input.primaryMuscles),
    secondaryMusclesJson: JSON.stringify(input.secondaryMuscles ?? []),
    equipment: input.equipment,
    countingType: input.countingType,
    difficulty: input.difficulty,
    cuesJson: JSON.stringify(input.cues ?? []),
    substitutesJson: JSON.stringify(input.substitutes ?? []),
    contraindicationsJson: JSON.stringify(input.contraindications ?? []),
    isCustom: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(exercises).values(row);
  await logOp(db, 'exercises', id, 'put', row);
  return toExercise({ ...row, deletedAt: null });
}

/** Bulk-inserts built-in exercises. Not oplogged: seed data ships with the app. */
export async function seedExercises(
  db: DB,
  items: Omit<Exercise, 'isCustom'>[],
): Promise<number> {
  const now = Date.now();
  const rows = items.map((e) => ({
    id: e.id,
    nameZh: e.nameZh,
    nameEn: e.nameEn,
    primaryMusclesJson: JSON.stringify(e.primaryMuscles),
    secondaryMusclesJson: JSON.stringify(e.secondaryMuscles),
    equipment: e.equipment,
    countingType: e.countingType,
    difficulty: e.difficulty,
    cuesJson: JSON.stringify(e.cues),
    substitutesJson: JSON.stringify(e.substitutes),
    contraindicationsJson: JSON.stringify(e.contraindications),
    isCustom: false,
    createdAt: now,
    updatedAt: now,
  }));
  const asyncClient = getAsyncClient(db);
  if (asyncClient) {
    const statement = `
      INSERT INTO exercises (
        id, name_zh, name_en, primary_muscles_json, secondary_muscles_json,
        equipment, counting_type, difficulty, cues_json, substitutes_json,
        contraindications_json, is_custom, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET
        name_zh = excluded.name_zh,
        name_en = excluded.name_en,
        primary_muscles_json = excluded.primary_muscles_json,
        secondary_muscles_json = excluded.secondary_muscles_json,
        equipment = excluded.equipment,
        counting_type = excluded.counting_type,
        difficulty = excluded.difficulty,
        cues_json = excluded.cues_json,
        substitutes_json = excluded.substitutes_json,
        contraindications_json = excluded.contraindications_json,
        is_custom = 0,
        updated_at = excluded.updated_at,
        deleted_at = NULL
    `;
    await asyncClient.withTransactionAsync(async () => {
      for (const row of rows) {
        await asyncClient.runAsync(statement, [
          row.id,
          row.nameZh,
          row.nameEn,
          row.primaryMusclesJson,
          row.secondaryMusclesJson,
          row.equipment,
          row.countingType,
          row.difficulty,
          row.cuesJson,
          row.substitutesJson,
          row.contraindicationsJson,
          row.createdAt,
          row.updatedAt,
        ]);
      }
    });
    return rows.length;
  }

  // Keep individual statements small for the expo-sqlite web worker bridge.
  for (let i = 0; i < rows.length; i += 10) {
    await db
      .insert(exercises)
      .values(rows.slice(i, i + 10))
      .onConflictDoUpdate({
        target: exercises.id,
        set: {
          nameZh: sql`excluded.name_zh`,
          nameEn: sql`excluded.name_en`,
          primaryMusclesJson: sql`excluded.primary_muscles_json`,
          secondaryMusclesJson: sql`excluded.secondary_muscles_json`,
          equipment: sql`excluded.equipment`,
          countingType: sql`excluded.counting_type`,
          difficulty: sql`excluded.difficulty`,
          cuesJson: sql`excluded.cues_json`,
          substitutesJson: sql`excluded.substitutes_json`,
          contraindicationsJson: sql`excluded.contraindications_json`,
          isCustom: false,
          updatedAt: now,
          deletedAt: null,
        },
      });
  }
  return rows.length;
}
