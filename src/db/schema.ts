import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * All tables use text ids (see newId in @/lib/id) and unix-ms timestamps.
 * JSON columns are stored as text; repositories own (de)serialization.
 */

export const userProfile = sqliteTable('user_profile', {
  id: text('id').primaryKey(), // singleton row: 'me'
  sex: text('sex'), // 'male' | 'female' | 'other'
  birthYear: integer('birth_year'),
  heightCm: real('height_cm'),
  weightKg: real('weight_kg'),
  experience: text('experience'), // 'novice' | 'intermediate' | 'advanced'
  goal: text('goal'), // 'hypertrophy' | 'fat_loss' | 'strength' | 'endurance' | 'toning'
  daysPerWeek: integer('days_per_week'),
  sessionMinutes: integer('session_minutes'),
  equipmentJson: text('equipment_json'), // string[]
  injuriesJson: text('injuries_json'), // string[]
  cardioPref: text('cardio_pref'),
  incomplete: integer('incomplete', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    nameZh: text('name_zh').notNull(),
    nameEn: text('name_en').notNull(),
    primaryMusclesJson: text('primary_muscles_json').notNull(), // string[]
    secondaryMusclesJson: text('secondary_muscles_json').notNull().default('[]'),
    equipment: text('equipment').notNull(), // 'barbell'|'dumbbell'|'machine'|'cable'|'bodyweight'|'kettlebell'|'cardio_machine'|'other'
    countingType: text('counting_type').notNull(), // 'weight_reps'|'reps_only'|'duration'|'distance_duration'|'assisted_weight_reps'
    difficulty: integer('difficulty').notNull().default(1), // 1-3
    cuesJson: text('cues_json').notNull().default('[]'), // string[]
    substitutesJson: text('substitutes_json').notNull().default('[]'), // exercise ids
    contraindicationsJson: text('contraindications_json').notNull().default('[]'), // injury tags
    isCustom: integer('is_custom', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (t) => [index('idx_exercises_equipment').on(t.equipment)],
);

export const plans = sqliteTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  goal: text('goal').notNull(),
  status: text('status').notNull().default('draft'), // 'draft'|'active'|'archived'
  durationWeeks: integer('duration_weeks').notNull(),
  daysPerWeek: integer('days_per_week').notNull(),
  progressionRule: text('progression_rule').notNull(), // 'linear'|'double_progression'|'rpe_based'
  source: text('source').notNull(), // 'ai'|'template'
  nutritionJson: text('nutrition_json'),
  explanation: text('explanation'),
  startedAt: integer('started_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const planDays = sqliteTable(
  'plan_days',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull(),
    dayOfWeek: integer('day_of_week').notNull(), // 1(Mon)-7(Sun)
    label: text('label').notNull(),
    cardioJson: text('cardio_json'), // {type,duration_min,intensity} | null
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('idx_plan_days_plan').on(t.planId)],
);

export const plannedExercises = sqliteTable(
  'planned_exercises',
  {
    id: text('id').primaryKey(),
    planDayId: text('plan_day_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    sets: integer('sets').notNull(),
    reps: text('reps').notNull(), // '8-12' | '10' | '30s'
    weightKg: real('weight_kg'),
    restSec: integer('rest_sec').notNull().default(90),
    note: text('note'),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('idx_planned_ex_day').on(t.planDayId)],
);

export const planRevisions = sqliteTable(
  'plan_revisions',
  {
    id: text('id').primaryKey(),
    planId: text('plan_id').notNull(),
    revisionNo: integer('revision_no').notNull(),
    diffJson: text('diff_json').notNull(),
    rollbackJson: text('rollback_json'),
    reason: text('reason'),
    source: text('source').notNull(), // 'ai'|'user'
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_plan_rev_plan').on(t.planId)],
);

export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(), // YYYY-MM-DD (local)
    planId: text('plan_id'),
    planDayId: text('plan_day_id'),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    note: text('note'),
    feeling: text('feeling'), // 'great'|'ok'|'tired'|'bad'
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_sessions_date').on(t.date)],
);

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    exerciseId: text('exercise_id').notNull(),
    setNo: integer('set_no').notNull(),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    durationSec: integer('duration_sec'),
    distanceM: real('distance_m'),
    rpe: real('rpe'),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    source: text('source').notNull().default('manual'), // 'manual'|'watch_manual'|'watch_auto'|'chat'
    confidence: real('confidence'),
    status: text('status').notNull().default('confirmed'), // 'confirmed'|'pending'
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('idx_set_logs_session').on(t.sessionId),
    index('idx_set_logs_exercise').on(t.exerciseId),
  ],
);

export const cardioLogs = sqliteTable(
  'cardio_logs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id'),
    date: text('date').notNull(),
    type: text('type').notNull(), // 'run'|'walk'|'cycle'|'row'|'elliptical'|'swim'|'jump_rope'|'hiit'|'other'
    durationMin: real('duration_min').notNull(),
    distanceKm: real('distance_km'),
    avgHr: integer('avg_hr'),
    intensity: text('intensity'), // 'low'|'moderate'|'high'
    source: text('source').notNull().default('manual'), // 'manual'|'health_import'|'chat'
    externalId: text('external_id'), // health platform UUID for dedup
    note: text('note'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_cardio_date').on(t.date), index('idx_cardio_external').on(t.externalId)],
);

export const bodyMetrics = sqliteTable(
  'body_metrics',
  {
    id: text('id').primaryKey(),
    date: text('date').notNull(),
    metric: text('metric').notNull(), // 'weight_kg'|'waist_cm'|'chest_cm'|'arm_cm'|'thigh_cm'|'hip_cm'|'body_fat_pct'
    value: real('value').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_body_metrics_date').on(t.date)],
);

export const chatSessions = sqliteTable('chat_sessions', {
  id: text('id').primaryKey(),
  title: text('title'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    role: text('role').notNull(), // 'user'|'assistant'|'tool'
    content: text('content').notNull(),
    cardJson: text('card_json'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_chat_msgs_session').on(t.sessionId)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(), // JSON
  updatedAt: integer('updated_at').notNull(),
});

export const syncOplog = sqliteTable(
  'sync_oplog',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    deviceId: text('device_id').notNull(),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    op: text('op').notNull(), // 'put'|'delete'
    payloadJson: text('payload_json'),
    ts: integer('ts').notNull(),
    synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('idx_oplog_synced').on(t.synced)],
);

export const agentLogs = sqliteTable(
  'agent_logs',
  {
    id: text('id').primaryKey(),
    agent: text('agent').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputSummary: text('input_summary'),
    outputJson: text('output_json'),
    validationResult: text('validation_result'), // 'pass'|'retry_pass'|'fail'
    userDecision: text('user_decision'), // 'accept'|'partial'|'reject'|null
    latencyMs: integer('latency_ms'),
    isBadcase: integer('is_badcase', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('idx_agent_logs_agent').on(t.agent)],
);
