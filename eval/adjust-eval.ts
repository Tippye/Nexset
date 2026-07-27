import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PlanDetail } from '../src/db/repositories/plan-repo';
import type { SetLog } from '../src/db/repositories/workout-repo';
import {
  computeDeviationReport,
  type DeviationSession,
} from '../src/lib/deviation';

const plan = fixturePlan();
const scenarios: { kind: string; expected: boolean; sessions: DeviationSession[] }[] = [];
for (let index = 0; index < 20; index++) scenarios.push({ kind: '不应调整', expected: false, sessions: [fullSession(8)] });
for (let index = 0; index < 15; index++) scenarios.push({ kind: '完成不足', expected: true, sessions: [partialSession()] });
for (let index = 0; index < 15; index++) scenarios.push({ kind: 'RPE过高', expected: true, sessions: [fullSession(9.5)] });
for (let index = 0; index < 15; index++) {
  const tired = fullSession(8);
  tired.feeling = 'tired';
  scenarios.push({ kind: '主观疲劳', expected: true, sessions: [tired] });
}
for (let index = 0; index < 15; index++) scenarios.push({ kind: '跳过训练', expected: true, sessions: [] });

const failed = scenarios.filter((scenario) => {
  const report = computeDeviationReport({
    plan,
    sessions: scenario.sessions,
    today: '2026-07-27',
  });
  return report.shouldTriggerAgent !== scenario.expected;
});
const noAdjust = scenarios.filter((scenario) => !scenario.expected);
const noAdjustFailures = noAdjust.filter((scenario) =>
  computeDeviationReport({ plan, sessions: scenario.sessions, today: '2026-07-27' }).shouldTriggerAgent,
);
const accuracy = (scenarios.length - failed.length) / scenarios.length;
const report = `# Nexset 调整触发本地评测

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| 偏差场景 | ${scenarios.length} | 80 |
| 触发方向正确率 | ${(accuracy * 100).toFixed(1)}% | ≥80% |
| “无偏差不调整”正确率 | ${(((noAdjust.length - noAdjustFailures.length) / noAdjust.length) * 100).toFixed(1)}% | ≥90% |

覆盖完成不足、RPE 过高、主观疲劳、跳过训练和 20 组不应调整场景。

> 该报告评估本地前置规则，不替代真实 DailyAdjustAgent 的专家方向与幅度抽查。
`;
writeFileSync(resolve(process.cwd(), 'eval/latest-adjust-report.md'), report, 'utf8');
process.stdout.write(report);
if (accuracy < 0.8 || noAdjustFailures.length) process.exitCode = 1;

function fixturePlan(): PlanDetail {
  return {
    id: 'plan',
    name: 'test',
    goal: 'hypertrophy',
    status: 'active',
    durationWeeks: 4,
    daysPerWeek: 1,
    progressionRule: 'double_progression',
    source: 'template',
    nutrition: null,
    explanation: null,
    startedAt: new Date('2026-07-27T00:00:00').getTime(),
    days: [{
      id: 'day',
      dayOfWeek: 1,
      label: 'A',
      cardio: null,
      exercises: [{
        id: 'planned',
        exerciseId: 'back_squat',
        sets: 3,
        reps: '8-12',
        weightKg: 50,
        restSec: 90,
        note: null,
      }],
    }],
  };
}

function fullSession(rpe: number): DeviationSession {
  return session([set(1, rpe), set(2, rpe), set(3, rpe)]);
}

function partialSession(): DeviationSession {
  return session([set(1, 8)]);
}

function session(sets: SetLog[]): DeviationSession {
  return { id: 'session', date: '2026-07-27', planDayId: 'day', endedAt: Date.now(), feeling: 'ok', sets };
}

function set(setNo: number, rpe: number): SetLog {
  return {
    id: `set-${setNo}`,
    sessionId: 'session',
    exerciseId: 'back_squat',
    setNo,
    weightKg: 50,
    reps: 10,
    durationSec: null,
    distanceM: null,
    rpe,
    isWarmup: false,
    source: 'manual',
    confidence: null,
    status: 'confirmed',
    createdAt: Date.now(),
  };
}
