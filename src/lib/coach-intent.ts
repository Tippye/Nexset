export type CoachIntent =
  | 'plan_generation'
  | 'daily_adjust'
  | 'log_entry'
  | 'stats_query'
  | 'exercise_question'
  | 'safety_boundary'
  | 'chat';

export type LogSlots = {
  exerciseQuery?: string;
  weightKg?: number;
  reps?: number;
  sets?: number;
};

export function classifyCoachIntent(message: string): CoachIntent {
  const text = message.trim().toLowerCase();
  if (
    /类固醇|睾酮|司坦唑醇|处方药|药物剂量|诊断|确诊|每天\s*[0-9]{2,4}\s*(?:卡|kcal)/i.test(text) ||
    /疼|痛|受伤|麻木/.test(text)
  ) return 'safety_boundary';
  if (/新计划|制定.*计划|生成.*计划|换.*计划|减脂计划|增肌计划/.test(text)) return 'plan_generation';
  if (/调整.*计划|只能练|改到.*天|这周.*练|减载|太累.*计划/.test(text)) return 'daily_adjust';
  if (/帮我记|记录|记一?组|再来一组/.test(text)) return 'log_entry';
  if (/最近|上次|进步|统计|训练量|一共|最好|纪录|多重/.test(text)) return 'stats_query';
  if (/怎么做|怎么发力|动作要点|替换|换个动作|姿势/.test(text)) return 'exercise_question';
  return 'chat';
}

export function extractLogSlots(message: string): LogSlots {
  const weight = message.match(/(\d+(?:\.\d+)?)\s*(?:公斤|kg|千克)/i);
  const reps = message.match(/(\d+)\s*(?:次|个)/);
  const sets = message.match(/(\d+)\s*组/);
  const action = message
    .replace(/帮我|请|记录|记一?下|记一?组|再来一组/gi, ' ')
    .replace(/\d+(?:\.\d+)?\s*(?:公斤|kg|千克|次|个|组)/gi, ' ')
    .replace(/[，,。]/g, ' ')
    .trim()
    .split(/\s+/)[0];
  return {
    exerciseQuery: action || undefined,
    weightKg: weight ? Number(weight[1]) : undefined,
    reps: reps ? Number(reps[1]) : undefined,
    sets: sets ? Number(sets[1]) : /记一?组|再来一组/.test(message) ? 1 : undefined,
  };
}

export function safetyReply(message: string): string {
  if (/疼|痛|受伤|麻木/.test(message)) {
    return '先停止会诱发疼痛的动作，不要带痛硬练。我可以帮你选择无痛替代动作，但不能诊断；如持续疼痛、麻木或活动受限请及时就医。';
  }
  if (/类固醇|睾酮|司坦唑醇|处方药|药物/.test(message)) {
    return '我不能提供处方药、类固醇的使用方案或剂量。若涉及治疗，请咨询有资质的医生；训练和营养方面我可以帮你采用更安全的自然进步方案。';
  }
  return '我不建议极端节食或低于 1200 kcal 的方案。可以从温和热量缺口、足量蛋白和可持续训练开始，必要时咨询医生或注册营养师。';
}
