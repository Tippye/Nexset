import Database from 'better-sqlite3';
import { describe, expect, it } from '@jest/globals';

import { NexsetDataService } from '../tools';

describe('Nexset MCP read-only data service', () => {
  it('returns profile, model metrics, and sync state without mutating SQLite', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE user_profile (id TEXT PRIMARY KEY, goal TEXT);
      CREATE TABLE plans (id TEXT PRIMARY KEY, status TEXT, updated_at INTEGER);
      CREATE TABLE plan_days (id TEXT PRIMARY KEY, plan_id TEXT, sort INTEGER, day_of_week INTEGER);
      CREATE TABLE planned_exercises (id TEXT PRIMARY KEY, plan_day_id TEXT, exercise_id TEXT, sort INTEGER);
      CREATE TABLE exercises (id TEXT PRIMARY KEY, name_zh TEXT, name_en TEXT);
      CREATE TABLE workout_sessions (id TEXT PRIMARY KEY, started_at INTEGER);
      CREATE TABLE set_logs (id TEXT PRIMARY KEY, session_id TEXT, weight_kg REAL, reps INTEGER);
      CREATE TABLE agent_logs (provider_kind TEXT, provider_id TEXT, latency_ms INTEGER, validation_result TEXT, estimated_cost_usd_micros INTEGER, degraded INTEGER, created_at INTEGER);
      CREATE TABLE sync_oplog (synced INTEGER, attempt_count INTEGER, next_attempt_at INTEGER);
      CREATE TABLE sync_inbox (op_id TEXT PRIMARY KEY);
      INSERT INTO user_profile VALUES ('me', 'strength');
      INSERT INTO agent_logs VALUES ('on_device', 'local-gguf', 120, 'pass', 0, 0, ${Date.now()});
      INSERT INTO sync_oplog VALUES (0, 1, 5000);
      INSERT INTO sync_inbox VALUES ('remote:1');
    `);
    const service = new NexsetDataService(db);

    expect(service.getProfile()).toMatchObject({ goal: 'strength' });
    expect(service.getIntelligenceMetrics()).toEqual([
      expect.objectContaining({ provider_kind: 'on_device', pass_rate: 1 }),
    ]);
    expect(service.getSyncStatus()).toMatchObject({ pending: 1, received: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM user_profile').get()).toEqual({ count: 1 });
  });
});
