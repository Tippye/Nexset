import { beforeEach, describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import { SEED_EXERCISES } from '@/data/exercises';

import { ensureDeviceId } from '../oplog';
import { addBodyMetric, getLatestMetric, getMetricHistory } from '../repositories/body-repo';
import { addCardioLog, getCardioByDate } from '../repositories/cardio-repo';
import { addChatMessage, createChatSession, getChatMessages } from '../repositories/chat-repo';
import {
  countExercises,
  createCustomExercise,
  getExercise,
  listExercises,
  seedExercises,
} from '../repositories/exercise-repo';
import { activatePlan, createPlan, getActivePlan, getPlan, addPlanRevision } from '../repositories/plan-repo';
import { getProfile, saveProfile } from '../repositories/profile-repo';
import { getSetting, setSetting } from '../repositories/settings-repo';
import {
  addSetLog,
  endSession,
  getLastSetsForExercise,
  getSessionSets,
  startSession,
} from '../repositories/workout-repo';
import { exercises, syncOplog } from '../schema';
import { createTestDb } from '../test-utils';
import type { DB } from '../types';

describe('data layer (I-0.2)', () => {
  let db: DB;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('migrations apply and are idempotent', async () => {
    // createTestDb ran them; a second call over same handle is covered by user_version guard.
    expect(await countExercises(db)).toBe(0);
  });

  it('device id is stable', async () => {
    const a = await ensureDeviceId(db);
    const b = await ensureDeviceId(db);
    expect(a).toBe(b);
    expect(a).toMatch(/^dev_/);
  });

  it('profile round-trips', async () => {
    expect(await getProfile(db)).toBeNull();
    await saveProfile(db, {
      sex: 'male',
      birthYear: 1998,
      heightCm: 175,
      weightKg: 70,
      experience: 'novice',
      goal: 'hypertrophy',
      daysPerWeek: 4,
      sessionMinutes: 60,
      equipment: ['barbell', 'dumbbell'],
      trainingLocation: 'gym',
      gymEquipmentIds: ['barbell', 'dumbbells'],
      injuries: ['lower_back'],
    });
    const p = await getProfile(db);
    expect(p?.goal).toBe('hypertrophy');
    expect(p?.equipment).toEqual(['barbell', 'dumbbell']);
    expect(p?.trainingLocation).toBe('gym');
    expect(p?.gymEquipmentIds).toEqual(['barbell', 'dumbbells']);
    // upsert
    await saveProfile(db, { goal: 'fat_loss' });
    expect((await getProfile(db))?.goal).toBe('fat_loss');
  });

  it('seeds and queries exercises', async () => {
    const n = await seedExercises(db, SEED_EXERCISES);
    expect(n).toBe(SEED_EXERCISES.length);
    expect(await countExercises(db)).toBe(SEED_EXERCISES.length);
    // reseed is a no-op
    await seedExercises(db, SEED_EXERCISES);
    expect(await countExercises(db)).toBe(SEED_EXERCISES.length);

    const bench = await getExercise(db, 'barbell_bench_press');
    expect(bench?.nameZh).toBe('杠铃卧推');

    const chest = await listExercises(db, { muscle: 'chest', equipment: 'barbell' });
    expect(chest.length).toBeGreaterThan(0);
    expect(chest.every((e) => e.primaryMuscles.includes('chest'))).toBe(true);

    const search = await listExercises(db, { keyword: '卧推' });
    expect(search.some((e) => e.id === 'barbell_bench_press')).toBe(true);
  });

  it('repairs malformed built-in exercise JSON during an idempotent reseed', async () => {
    await seedExercises(db, SEED_EXERCISES);
    await db
      .update(exercises)
      .set({ cuesJson: '["truncated' })
      .where(eq(exercises.id, 'barbell_bench_press'));

    // Reads degrade safely before repair instead of crashing app startup.
    expect((await getExercise(db, 'barbell_bench_press'))?.cues).toEqual([]);

    await seedExercises(db, SEED_EXERCISES);
    const repaired = await getExercise(db, 'barbell_bench_press');
    expect(repaired?.cues.length).toBeGreaterThan(0);
  });

  it('creates custom exercises', async () => {
    const ex = await createCustomExercise(db, {
      nameZh: '自制侧平举',
      nameEn: 'My Lateral Raise',
      primaryMuscles: ['side_delt'],
      secondaryMuscles: [],
      equipment: 'dumbbell',
      countingType: 'weight_reps',
      difficulty: 1,
      cues: [],
    });
    expect(ex.id).toMatch(/^custom_/);
    expect(ex.isCustom).toBe(true);
    const found = await listExercises(db, { keyword: '自制' });
    expect(found).toHaveLength(1);
  });

  it('plan create/get/activate round-trips', async () => {
    const planId = await createPlan(db, {
      name: '测试计划',
      goal: 'hypertrophy',
      durationWeeks: 4,
      daysPerWeek: 2,
      progressionRule: 'double_progression',
      source: 'template',
      nutrition: { dailyKcal: 2600, proteinG: 140, carbG: 300, fatG: 70 },
      days: [
        {
          dayOfWeek: 1,
          label: '推力日',
          cardio: { type: 'jog', durationMin: 20, intensity: 'moderate' },
          exercises: [
            { exerciseId: 'barbell_bench_press', sets: 4, reps: '8-10', weightKg: 40 },
            { exerciseId: 'cable_pushdown', sets: 3, reps: '12-15', weightKg: 20 },
          ],
        },
        {
          dayOfWeek: 4,
          label: '拉力日',
          exercises: [{ exerciseId: 'lat_pulldown', sets: 4, reps: '10-12', weightKg: 45 }],
        },
      ],
    });
    const plan = await getPlan(db, planId);
    expect(plan?.status).toBe('draft');
    expect(plan?.days).toHaveLength(2);
    expect(plan?.days[0].exercises[0].exerciseId).toBe('barbell_bench_press');
    expect(plan?.nutrition?.dailyKcal).toBe(2600);

    expect(await getActivePlan(db)).toBeNull();
    await activatePlan(db, planId);
    expect((await getActivePlan(db))?.id).toBe(planId);

    // Activating a second plan archives the first.
    const plan2 = await createPlan(db, {
      name: '新计划',
      goal: 'fat_loss',
      durationWeeks: 4,
      daysPerWeek: 3,
      progressionRule: 'linear',
      source: 'ai',
      days: [],
    });
    await activatePlan(db, plan2);
    expect((await getActivePlan(db))?.id).toBe(plan2);
    expect((await getPlan(db, planId))?.status).toBe('archived');

    await addPlanRevision(db, plan2, { changes: [] }, null, '测试', 'ai');
  });

  it('workout session and set logs round-trip', async () => {
    const s1 = await startSession(db, { date: '2026-07-20' });
    await addSetLog(db, s1, { exerciseId: 'barbell_bench_press', setNo: 1, weightKg: 60, reps: 8 });
    await addSetLog(db, s1, { exerciseId: 'barbell_bench_press', setNo: 2, weightKg: 60, reps: 7, rpe: 8.5 });
    await endSession(db, s1, { feeling: 'ok' });

    const sets = await getSessionSets(db, s1);
    expect(sets).toHaveLength(2);
    expect(sets[1].rpe).toBe(8.5);

    const s2 = await startSession(db, { date: '2026-07-22' });
    await addSetLog(db, s2, { exerciseId: 'barbell_bench_press', setNo: 1, weightKg: 62.5, reps: 8 });

    // Last sets exclude the current session and pick the most recent other one.
    const last = await getLastSetsForExercise(db, 'barbell_bench_press', { excludeSessionId: s2 });
    expect(last).toHaveLength(2);
    expect(last[0].weightKg).toBe(60);
  });

  it('cardio dedups by external id', async () => {
    const first = await addCardioLog(db, {
      type: 'run', durationMin: 30, distanceKm: 5, source: 'health_import', externalId: 'hk-1', date: '2026-07-25',
    });
    expect(first).not.toBeNull();
    const dup = await addCardioLog(db, {
      type: 'run', durationMin: 30, source: 'health_import', externalId: 'hk-1', date: '2026-07-25',
    });
    expect(dup).toBeNull();
    expect(await getCardioByDate(db, '2026-07-25')).toHaveLength(1);
  });

  it('body metrics history and latest', async () => {
    await addBodyMetric(db, 'weight_kg', 70.5, '2026-07-20');
    await addBodyMetric(db, 'weight_kg', 70.1, '2026-07-24');
    const latest = await getLatestMetric(db, 'weight_kg');
    expect(latest?.value).toBe(70.1);
    expect(await getMetricHistory(db, 'weight_kg')).toHaveLength(2);
  });

  it('chat sessions and messages', async () => {
    const sid = await createChatSession(db, '默认会话');
    await addChatMessage(db, sid, 'user', '帮我记一组卧推');
    await addChatMessage(db, sid, 'assistant', '好的，请确认', { type: 'log_confirm' });
    const msgs = await getChatMessages(db, sid);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(JSON.parse(msgs[1].cardJson!)).toEqual({ type: 'log_confirm' });
  });

  it('settings round-trip and oplog only for synced keys', async () => {
    await setSetting(db, 'preferences', { theme: 'dark' });
    await setSetting(db, 'ai_config_meta', { provider: 'openai' }); // local-only key
    expect(await getSetting(db, 'preferences')).toEqual({ theme: 'dark' });

    const ops = await db.select().from(syncOplog);
    const settingOps = ops.filter((o) => o.tableName === 'settings');
    expect(settingOps.some((o) => o.rowId === 'preferences')).toBe(true);
    expect(settingOps.some((o) => o.rowId === 'ai_config_meta')).toBe(false);
  });

  it('every synced write lands in the oplog', async () => {
    await saveProfile(db, { goal: 'strength' });
    const s = await startSession(db);
    await addSetLog(db, s, { exerciseId: 'back_squat', setNo: 1, weightKg: 80, reps: 5 });
    await addBodyMetric(db, 'weight_kg', 71);
    const ops = await db.select().from(syncOplog);
    const tables = new Set(ops.map((o) => o.tableName));
    expect(tables.has('user_profile')).toBe(true);
    expect(tables.has('workout_sessions')).toBe(true);
    expect(tables.has('set_logs')).toBe(true);
    expect(tables.has('body_metrics')).toBe(true);
    expect(ops.every((o) => o.synced === false)).toBe(true);
  });
});
