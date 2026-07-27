import { describe, expect, it } from '@jest/globals';

import { classifyCoachIntent, extractLogSlots, type CoachIntent } from '../coach-intent';

describe('coach intent router', () => {
  const cases: [string, CoachIntent][] = [
    ['给我制定一个减脂计划', 'plan_generation'],
    ['这周只能练三天，调整一下计划', 'daily_adjust'],
    ['帮我记一组深蹲 80 公斤 5 次', 'log_entry'],
    ['我最近卧推有进步吗', 'stats_query'],
    ['硬拉怎么发力', 'exercise_question'],
    ['硬拉的时候下背疼', 'safety_boundary'],
    ['类固醇怎么用', 'safety_boundary'],
    ['你好', 'chat'],
  ];
  it.each(cases)('%s → %s', (message, expected) => {
    expect(classifyCoachIntent(message)).toBe(expected);
  });

  it('extracts log slots', () => {
    expect(extractLogSlots('帮我记 3 组 深蹲 80 公斤 5 次')).toMatchObject({
      weightKg: 80,
      reps: 5,
      sets: 3,
    });
  });
});
