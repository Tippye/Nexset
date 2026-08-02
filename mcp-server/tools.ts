import Database from 'better-sqlite3';

export class NexsetDataService {
  constructor(private readonly db: Database.Database) {}

  getProfile(): unknown {
    return this.db.prepare('SELECT * FROM user_profile WHERE id = ? LIMIT 1').get('me') ?? null;
  }

  getActivePlan(): unknown {
    const plan = this.db
      .prepare("SELECT * FROM plans WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    if (!plan) return null;
    const days = this.db
      .prepare('SELECT * FROM plan_days WHERE plan_id = ? ORDER BY sort, day_of_week')
      .all(plan.id) as Record<string, unknown>[];
    const exercises = this.db.prepare(
      `SELECT pe.*, e.name_zh, e.name_en
       FROM planned_exercises pe
       JOIN plan_days pd ON pd.id = pe.plan_day_id
       LEFT JOIN exercises e ON e.id = pe.exercise_id
       WHERE pd.plan_id = ?
       ORDER BY pd.sort, pe.sort`,
    ).all(plan.id) as Record<string, unknown>[];
    return {
      ...plan,
      days: days.map((day) => ({
        ...day,
        exercises: exercises.filter((exercise) => exercise.plan_day_id === day.id),
      })),
    };
  }

  listRecentWorkouts(limit = 10): unknown[] {
    return this.db
      .prepare(
        `SELECT ws.*,
                COUNT(sl.id) AS set_count,
                COALESCE(SUM(COALESCE(sl.weight_kg, 0) * COALESCE(sl.reps, 0)), 0) AS volume_kg
         FROM workout_sessions ws
         LEFT JOIN set_logs sl ON sl.session_id = ws.id
         GROUP BY ws.id
         ORDER BY ws.started_at DESC
         LIMIT ?`,
      )
      .all(clampLimit(limit));
  }

  getIntelligenceMetrics(sinceDays = 30): unknown[] {
    const since = Date.now() - clampLimit(sinceDays, 1, 365) * 86_400_000;
    return this.db
      .prepare(
        `SELECT COALESCE(provider_kind, 'unknown') AS provider_kind,
                COALESCE(provider_id, 'unknown') AS provider_id,
                COUNT(*) AS runs,
                ROUND(AVG(COALESCE(latency_ms, 0))) AS average_latency_ms,
                ROUND(AVG(CASE WHEN validation_result != 'fail' THEN 1.0 ELSE 0.0 END), 4) AS pass_rate,
                ROUND(SUM(estimated_cost_usd_micros) / 1000000.0, 6) AS estimated_cost_usd,
                ROUND(AVG(CASE WHEN degraded = 1 THEN 1.0 ELSE 0.0 END), 4) AS degradation_rate
         FROM agent_logs
         WHERE created_at >= ?
         GROUP BY provider_kind, provider_id
         ORDER BY provider_kind, provider_id`,
      )
      .all(since);
  }

  getSyncStatus(): unknown {
    const queue = this.db
      .prepare(
        `SELECT COUNT(*) AS pending,
                COALESCE(MAX(attempt_count), 0) AS max_attempt_count,
                MIN(CASE WHEN synced = 0 THEN next_attempt_at END) AS next_attempt_at
         FROM sync_oplog WHERE synced = 0`,
      )
      .get() as Record<string, unknown>;
    const inbox = this.db.prepare('SELECT COUNT(*) AS received FROM sync_inbox').get() as Record<
      string,
      unknown
    >;
    return { ...queue, ...inbox };
  }
}

export function openReadOnlyDatabase(path: string): Database.Database {
  return new Database(path, { readonly: true, fileMustExist: true });
}

function clampLimit(value: number, min = 1, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
