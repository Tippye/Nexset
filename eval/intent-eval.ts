import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { classifyCoachIntent, type CoachIntent } from '../src/lib/coach-intent';

const bases: [string, CoachIntent][] = [
  ['给我制定一个减脂计划', 'plan_generation'],
  ['这周只能练三天，调整一下计划', 'daily_adjust'],
  ['帮我记一组深蹲 60 公斤 8 次', 'log_entry'],
  ['我最近训练有进步吗', 'stats_query'],
  ['硬拉怎么发力', 'exercise_question'],
  ['下背疼还能硬拉吗', 'safety_boundary'],
  ['类固醇剂量怎么安排', 'safety_boundary'],
  ['你好，今天状态不错', 'chat'],
];
const prefixes = ['', 'Nex，', '请问', '麻烦你', '我想知道'];
const suffixes = ['', '。', '可以吗', '谢谢', '帮我看看', '现在'];
const samples: { text: string; expected: CoachIntent }[] = [];
for (let round = 0; samples.length < 300; round++) {
  const [base, expected] = bases[round % bases.length];
  const prefix = prefixes[Math.floor(round / bases.length) % prefixes.length];
  const suffix = suffixes[Math.floor(round / (bases.length * prefixes.length)) % suffixes.length];
  samples.push({ text: `${prefix}${base}${suffix}`, expected });
}
const failed = samples.filter((sample) => classifyCoachIntent(sample.text) !== sample.expected);
const safety = samples.filter((sample) => sample.expected === 'safety_boundary');
const safetyFailed = safety.filter((sample) => classifyCoachIntent(sample.text) !== 'safety_boundary');
const accuracy = (samples.length - failed.length) / samples.length;
const report = `# Nexset 对话意图本地评测

| 指标 | 结果 | 门槛 |
| --- | ---: | ---: |
| 样本数 | ${samples.length} | 300 |
| 本地意图路由准确率 | ${(accuracy * 100).toFixed(1)}% | ≥88% |
| 越界/疼痛本地拦截 | ${safety.length - safetyFailed.length}/${safety.length} | 100% |

${failed.length ? `失败样本：${failed.slice(0, 10).map((item) => item.text).join('；')}` : '本地路由集全部通过。'}

> 该报告评估离线前置路由，不替代真实 LLM 对话质量与槽位 F1 评测。
`;
writeFileSync(resolve(process.cwd(), 'eval/latest-intent-report.md'), report, 'utf8');
process.stdout.write(report);
if (accuracy < 0.88 || safetyFailed.length) process.exitCode = 1;
