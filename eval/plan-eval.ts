import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SEED_EXERCISES, forbiddenExerciseIds } from '../src/data/exercises';
import type { Exercise } from '../src/db/repositories/exercise-repo';
import type { PlanInput } from '../src/db/repositories/plan-repo';
import type { UserProfile } from '../src/db/repositories/profile-repo';
import { computeBaseline } from '../src/lib/nutrition';
import { generateTemplatePlan } from '../src/lib/plan-templates';
import { validatePlanInput } from '../src/lib/plan-validators';

const EXERCISES = new Map<string, Exercise>(
  SEED_EXERCISES.map((exercise) => [exercise.id, { ...exercise, isCustom: false }]),
);
const profiles = buildProfiles();
const durations: number[] = [];
let profilePasses = 0;
for (const profile of profiles) {
  const started = performance.now();
  const result = generateTemplatePlan(
    profile,
    EXERCISES,
    forbiddenExerciseIds(profile.injuries ?? []),
  );
  durations.push(performance.now() - started);
  if (result.ok) profilePasses += 1;
}

const validCases = profiles.slice(0, 20).map((profile, index) => ({
  id: `valid-${index + 1}`,
  profile,
  plan: generateTemplatePlan(
    profile,
    EXERCISES,
    forbiddenExerciseIds(profile.injuries ?? []),
  ).plan,
}));
const invalidCases = buildInvalidCases();
const validGoldenPasses = validCases.filter((fixture) =>
  validate(fixture.plan, fixture.profile).ok,
).length;
const unsafeFailures: string[] = [];
for (const fixture of invalidCases) {
  if (!fixture.caught(validate(fixture.plan, fixture.profile))) unsafeFailures.push(fixture.id);
}
const unsafeCaught = invalidCases.length - unsafeFailures.length;
const p95 = percentile(durations, 0.95);
const dangerousPlanRate = (invalidCases.length - unsafeCaught) / invalidCases.length;
const passed =
  profilePasses === profiles.length &&
  validGoldenPasses === validCases.length &&
  unsafeCaught === invalidCases.length;

const report = `# Nexset 计划评测报告

生成时间：${new Date().toISOString()}

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| 60 份档案模板结构/硬校验通过 | ${profilePasses}/${profiles.length} | 60/60 |
| 合法黄金集通过 | ${validGoldenPasses}/${validCases.length} | 20/20 |
| 非法黄金集被拒绝或安全钳制 | ${unsafeCaught}/${invalidCases.length} | 20/20 |
| 危险计划漏放率 | ${(dangerousPlanRate * 100).toFixed(1)}% | 0% |
| 本地模板生成延迟 P95 | ${p95.toFixed(2)}ms | 仅记录 |

覆盖目标、经验、器械、伤病，以及未知动作 ID、伤病禁忌、危险起始重量和营养超出 TDEE ±25%。

${passed ? '本地生成与安全校验黄金集全部通过。' : `评测失败。未拦截样本：${unsafeFailures.join('、') || '无'}。`}

> 本报告不包含真实 LLM 的一次通过率、重试通过率或网络延迟。该部分必须在用户明确提供测试 API Key 并同意产生调用费用后执行。
`;

writeFileSync(resolve(process.cwd(), 'eval/latest-report.md'), report, 'utf8');
process.stdout.write(report);
if (!passed) process.exitCode = 1;

function buildProfiles(): UserProfile[] {
  const goals = ['hypertrophy', 'fat_loss', 'strength', 'endurance', 'toning'] as const;
  const experiences = ['novice', 'intermediate', 'advanced'] as const;
  const equipmentSets = [
    ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'cardio_machine'],
    ['dumbbell', 'kettlebell'],
    [],
    ['barbell'],
  ];
  const injurySets = [[], ['lower_back'], ['knee'], ['shoulder', 'wrist']];
  const result: UserProfile[] = [];
  for (const goal of goals) {
    for (const experience of experiences) {
      for (let index = 0; index < equipmentSets.length; index++) {
        result.push({
          sex: result.length % 2 ? 'female' : 'male',
          birthYear: 1982 + (result.length % 20),
          heightCm: 158 + (result.length % 25),
          weightKg: 52 + (result.length % 38),
          goal,
          experience,
          daysPerWeek: 2 + (result.length % 5),
          sessionMinutes: [45, 60, 90][result.length % 3],
          equipment: equipmentSets[index],
          injuries: injurySets[(result.length + index) % injurySets.length],
          incomplete: false,
        });
      }
    }
  }
  return result;
}

function buildInvalidCases(): {
  id: string;
  profile: UserProfile;
  plan: PlanInput;
  caught: (result: ReturnType<typeof validate>) => boolean;
}[] {
  const fixtures: {
    id: string;
    profile: UserProfile;
    plan: PlanInput;
    caught: (result: ReturnType<typeof validate>) => boolean;
  }[] = [];
  const profile: UserProfile = {
    sex: 'male',
    birthYear: 1995,
    heightCm: 175,
    weightKg: 70,
    goal: 'hypertrophy',
    experience: 'novice',
    daysPerWeek: 3,
    sessionMinutes: 60,
    equipment: ['barbell', 'dumbbell', 'machine', 'cable'],
    injuries: [],
  };
  const clean = generateTemplatePlan(profile, EXERCISES, new Set()).plan;
  for (let index = 0; index < 5; index++) {
    const plan = clone(clean);
    plan.days[index % plan.days.length].exercises[0].exerciseId = `invented_${index}`;
    fixtures.push({
      id: `unknown-id-${index + 1}`,
      profile,
      plan,
      caught: (checked) => !checked.ok && checked.errors.some((error) => error.includes('未知动作')),
    });
  }
  for (let index = 0; index < 5; index++) {
    const injured = { ...profile, injuries: ['lower_back'] };
    const plan = clone(clean);
    plan.days[index % plan.days.length].exercises[0].exerciseId = 'deadlift';
    fixtures.push({
      id: `contraindication-${index + 1}`,
      profile: injured,
      plan,
      caught: (checked) =>
        !checked.ok && checked.errors.some((error) => error.includes('禁忌冲突')),
    });
  }
  for (let index = 0; index < 5; index++) {
    const plan = clone(clean);
    plan.days[index % plan.days.length].exercises[0] = {
      ...plan.days[index % plan.days.length].exercises[0],
      exerciseId: 'back_squat',
      weightKg: 300 + index * 10,
    };
    fixtures.push({
      id: `unsafe-weight-${index + 1}`,
      profile,
      plan,
      caught: (checked) =>
        checked.warnings.some((warning) => warning.includes('保守上限')) &&
        (checked.plan.days[index % checked.plan.days.length].exercises[0].weightKg ?? 999) <= 56,
    });
  }
  for (let index = 0; index < 5; index++) {
    const plan = clone(clean);
    if (!plan.nutrition) throw new Error('Template fixture must include nutrition');
    plan.nutrition.dailyKcal = 5000 + index * 100;
    const max = Math.round(computeBaseline(profile).tdee * 1.25);
    fixtures.push({
      id: `unsafe-nutrition-${index + 1}`,
      profile,
      plan,
      caught: (checked) =>
        checked.warnings.some((warning) => warning.includes('TDEE±25%')) &&
        (checked.plan.nutrition?.dailyKcal ?? 99999) <= max,
    });
  }
  return fixtures;
}

function validate(plan: PlanInput, profile: UserProfile) {
  return validatePlanInput(plan, {
    exercises: EXERCISES,
    forbiddenIds: forbiddenExerciseIds(profile.injuries ?? []),
    profile,
    tdee: computeBaseline(profile).tdee,
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function percentile(values: number[], percentileValue: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1)] ?? 0;
}
