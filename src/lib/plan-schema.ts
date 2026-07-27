import { z } from 'zod';

import type { PlanInput } from '@/db/repositories/plan-repo';

/**
 * Wire format produced by PlanGenerationAgent (PRD §7.1, snake_case) and by
 * the template engine. Validated with zod, then mapped to PlanInput.
 */

export const AiPlanExerciseSchema = z.object({
  exercise_id: z.string().min(1),
  sets: z.number().int().min(1).max(10),
  reps: z.string().min(1).max(20),
  start_weight_kg: z.number().min(0).max(500).nullish(),
  rest_sec: z.number().int().min(15).max(600).optional(),
  note: z.string().max(200).nullish(),
});

export const AiPlanCardioSchema = z
  .object({
    type: z.string().min(1),
    duration_min: z.number().min(5).max(180),
    intensity: z.enum(['low', 'moderate', 'high']),
  })
  .nullish();

export const AiPlanDaySchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  label: z.string().min(1).max(30),
  exercises: z.array(AiPlanExerciseSchema).max(12),
  cardio: AiPlanCardioSchema,
});

export const AiPlanNutritionSchema = z.object({
  daily_kcal: z.number().int().min(800).max(6000),
  protein_g: z.number().int().min(30).max(400),
  carb_g: z.number().int().min(0).max(900),
  fat_g: z.number().int().min(15).max(300),
  rationale: z.string().max(300).optional(),
});

export const AiPlanSchema = z.object({
  plan: z.object({
    name: z.string().min(1).max(60),
    goal: z.enum(['hypertrophy', 'fat_loss', 'strength', 'endurance', 'toning']),
    duration_weeks: z.number().int().min(1).max(16),
    days_per_week: z.number().int().min(1).max(7),
    progression_rule: z.enum(['linear', 'double_progression', 'rpe_based']),
    days: z.array(AiPlanDaySchema).min(1).max(7),
    nutrition: AiPlanNutritionSchema.nullish(),
  }),
  explanation: z.string().max(2000).default(''),
});

export type AiPlan = z.infer<typeof AiPlanSchema>;

/** Provider-neutral JSON Schema used by propose_plan and JSON-in-text mode. */
export const AI_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['plan', 'explanation'],
  properties: {
    plan: {
      type: 'object',
      additionalProperties: false,
      required: [
        'name',
        'goal',
        'duration_weeks',
        'days_per_week',
        'progression_rule',
        'days',
        'nutrition',
      ],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 60 },
        goal: {
          type: 'string',
          enum: ['hypertrophy', 'fat_loss', 'strength', 'endurance', 'toning'],
        },
        duration_weeks: { type: 'integer', minimum: 1, maximum: 16 },
        days_per_week: { type: 'integer', minimum: 1, maximum: 7 },
        progression_rule: {
          type: 'string',
          enum: ['linear', 'double_progression', 'rpe_based'],
        },
        days: {
          type: 'array',
          minItems: 1,
          maxItems: 7,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['day_of_week', 'label', 'exercises', 'cardio'],
            properties: {
              day_of_week: { type: 'integer', minimum: 1, maximum: 7 },
              label: { type: 'string', minLength: 1, maxLength: 30 },
              exercises: {
                type: 'array',
                maxItems: 12,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: [
                    'exercise_id',
                    'sets',
                    'reps',
                    'start_weight_kg',
                    'rest_sec',
                    'note',
                  ],
                  properties: {
                    exercise_id: { type: 'string', minLength: 1 },
                    sets: { type: 'integer', minimum: 1, maximum: 10 },
                    reps: { type: 'string', minLength: 1, maxLength: 20 },
                    start_weight_kg: {
                      anyOf: [{ type: 'number', minimum: 0, maximum: 500 }, { type: 'null' }],
                    },
                    rest_sec: { type: 'integer', minimum: 15, maximum: 600 },
                    note: { anyOf: [{ type: 'string', maxLength: 200 }, { type: 'null' }] },
                  },
                },
              },
              cardio: {
                anyOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type', 'duration_min', 'intensity'],
                    properties: {
                      type: { type: 'string', minLength: 1 },
                      duration_min: { type: 'number', minimum: 5, maximum: 180 },
                      intensity: { type: 'string', enum: ['low', 'moderate', 'high'] },
                    },
                  },
                  { type: 'null' },
                ],
              },
            },
          },
        },
        nutrition: {
          anyOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: ['daily_kcal', 'protein_g', 'carb_g', 'fat_g', 'rationale'],
              properties: {
                daily_kcal: { type: 'integer', minimum: 800, maximum: 6000 },
                protein_g: { type: 'integer', minimum: 30, maximum: 400 },
                carb_g: { type: 'integer', minimum: 0, maximum: 900 },
                fat_g: { type: 'integer', minimum: 15, maximum: 300 },
                rationale: { type: 'string', maxLength: 300 },
              },
            },
            { type: 'null' },
          ],
        },
      },
    },
    explanation: { type: 'string', maxLength: 2000 },
  },
};

export function toPlanInput(ai: AiPlan, source: 'ai' | 'template'): PlanInput {
  const p = ai.plan;
  return {
    name: p.name,
    goal: p.goal,
    durationWeeks: p.duration_weeks,
    daysPerWeek: p.days_per_week,
    progressionRule: p.progression_rule,
    source,
    explanation: ai.explanation || null,
    nutrition: p.nutrition
      ? {
          dailyKcal: p.nutrition.daily_kcal,
          proteinG: p.nutrition.protein_g,
          carbG: p.nutrition.carb_g,
          fatG: p.nutrition.fat_g,
          rationale: p.nutrition.rationale,
        }
      : null,
    days: p.days.map((d) => ({
      dayOfWeek: d.day_of_week,
      label: d.label,
      cardio: d.cardio
        ? { type: d.cardio.type, durationMin: d.cardio.duration_min, intensity: d.cardio.intensity }
        : null,
      exercises: d.exercises.map((e) => ({
        exerciseId: e.exercise_id,
        sets: e.sets,
        reps: e.reps,
        weightKg: e.start_weight_kg ?? null,
        restSec: e.rest_sec ?? 90,
        note: e.note ?? null,
      })),
    })),
  };
}
