import { describe, expect, it } from '@jest/globals';

import { INJURY_CONTRAINDICATION_TAGS, SEED_EXERCISES, forbiddenExerciseIds } from '../exercises';

const MUSCLES = new Set([
  'chest', 'back', 'lats', 'traps', 'front_delt', 'side_delt', 'rear_delt',
  'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'calves',
  'core', 'lower_back', 'hip_flexors', 'adductors', 'abductors', 'full_body', 'cardio',
]);

const EQUIPMENT = new Set([
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'cardio_machine', 'other',
]);

const COUNTING_TYPES = new Set([
  'weight_reps', 'reps_only', 'duration', 'distance_duration', 'assisted_weight_reps',
]);

const INJURY_TAGS = new Set<string>(INJURY_CONTRAINDICATION_TAGS);

describe('exercise seed data (I-0.3)', () => {
  const ids = new Set(SEED_EXERCISES.map((e) => e.id));

  it('has at least 200 exercises', () => {
    expect(SEED_EXERCISES.length).toBeGreaterThanOrEqual(200);
  });

  it('has unique snake_case ids', () => {
    expect(ids.size).toBe(SEED_EXERCISES.length);
    for (const e of SEED_EXERCISES) {
      expect(e.id).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('has complete and valid fields', () => {
    for (const e of SEED_EXERCISES) {
      expect(e.nameZh.length).toBeGreaterThan(0);
      expect(e.nameEn.length).toBeGreaterThan(0);
      expect(EQUIPMENT.has(e.equipment)).toBe(true);
      expect(COUNTING_TYPES.has(e.countingType)).toBe(true);
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
      for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
        if (!MUSCLES.has(m)) throw new Error(`${e.id}: unknown muscle ${m}`);
      }
      expect([1, 2, 3]).toContain(e.difficulty);
    }
  });

  it('substitute ids all exist', () => {
    for (const e of SEED_EXERCISES) {
      for (const s of e.substitutes) {
        if (!ids.has(s)) throw new Error(`${e.id}: unknown substitute ${s}`);
        expect(s).not.toBe(e.id);
      }
    }
  });

  it('contraindication tags are valid injury tags', () => {
    for (const e of SEED_EXERCISES) {
      for (const c of e.contraindications) {
        if (!INJURY_TAGS.has(c)) throw new Error(`${e.id}: unknown injury tag ${c}`);
      }
    }
  });

  it('covers all counting types and major equipment', () => {
    const counting = new Set(SEED_EXERCISES.map((e) => e.countingType));
    expect(counting.size).toBe(5);
    const equip = new Set(SEED_EXERCISES.map((e) => e.equipment));
    for (const wanted of ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'cardio_machine']) {
      expect(equip.has(wanted as never)).toBe(true);
    }
  });

  it('forbiddenExerciseIds maps injuries to exercises', () => {
    const forbidden = forbiddenExerciseIds(['lower_back']);
    expect(forbidden.has('deadlift')).toBe(true);
    expect(forbidden.has('barbell_row')).toBe(true);
    expect(forbidden.has('lat_pulldown')).toBe(false);
    expect(forbiddenExerciseIds([]).size).toBe(0);
  });
});
