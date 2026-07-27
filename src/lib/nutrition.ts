import type { UserProfile } from '@/db/repositories/profile-repo';

export type NutritionBaseline = {
  bmr: number;
  tdee: number;
  /** kg per week, negative = losing */
  weightTrendKgPerWeek: number | null;
};

export type NutritionTargets = {
  dailyKcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  rationale: string;
};

const ACTIVITY_FACTOR: Record<number, number> = {
  0: 1.2,
  1: 1.3,
  2: 1.375,
  3: 1.45,
  4: 1.5,
  5: 1.55,
  6: 1.65,
  7: 1.7,
};

/** Mifflin-St Jeor. Falls back to conservative defaults for missing fields. */
export function computeBaseline(
  profile: UserProfile,
  weightTrendKgPerWeek: number | null = null,
): NutritionBaseline {
  const weight = profile.weightKg ?? 65;
  const height = profile.heightCm ?? 170;
  const age = profile.birthYear ? new Date().getFullYear() - profile.birthYear : 30;
  const sexOffset = profile.sex === 'female' ? -161 : 5;
  const bmr = Math.round(10 * weight + 6.25 * height - 5 * age + sexOffset);
  const factor = ACTIVITY_FACTOR[Math.min(7, Math.max(0, profile.daysPerWeek ?? 3))];
  return { bmr, tdee: Math.round(bmr * factor), weightTrendKgPerWeek };
}

/**
 * Local formula-based targets (template plans + AI fallback). AI adjustments
 * are clamped to TDEE ±25% by the plan validators regardless of source.
 */
export function computeTargets(profile: UserProfile, baseline: NutritionBaseline): NutritionTargets {
  const weight = profile.weightKg ?? 65;
  const goal = profile.goal ?? 'hypertrophy';

  let kcal: number;
  let rationale: string;
  switch (goal) {
    case 'fat_loss':
      kcal = Math.round(baseline.tdee * 0.85);
      rationale = '减脂期热量缺口约15%';
      break;
    case 'hypertrophy':
      kcal = Math.round(baseline.tdee * 1.1);
      rationale = '增肌期热量盈余约10%';
      break;
    case 'strength':
      kcal = Math.round(baseline.tdee * 1.05);
      rationale = '力量期小幅热量盈余';
      break;
    default:
      kcal = baseline.tdee;
      rationale = '维持体重热量';
  }

  const proteinG = Math.round(weight * (goal === 'fat_loss' ? 2.0 : 1.8));
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbG = Math.round((kcal - proteinG * 4 - fatG * 9) / 4);
  return { dailyKcal: kcal, proteinG, carbG, fatG: fatG, rationale };
}

/** 静态食物举例（开放问题2已确认：做，不含食物数据库）。 */
export function proteinFoodExample(proteinG: number): string {
  const chicken = Math.round((proteinG * 0.45) / 30); // ~30g protein per 150g breast
  const eggs = Math.round((proteinG * 0.2) / 6.5);
  const scoops = Math.max(1, Math.round((proteinG * 0.2) / 25));
  return `${proteinG}g 蛋白 ≈ ${chicken} 块鸡胸肉 + ${eggs} 个鸡蛋 + ${scoops} 勺蛋白粉（示例组合，可替换等量蛋白来源）`;
}
