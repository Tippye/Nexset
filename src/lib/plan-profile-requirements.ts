import type { UserProfile } from '@/db/repositories/profile-repo';

export type TraditionalPlanRequirement = {
  key:
    | 'sex'
    | 'weightKg'
    | 'goal'
    | 'experience'
    | 'daysPerWeek'
    | 'trainingLocation'
    | 'gymEquipmentIds';
  label: string;
  onboardingStep: number;
};

const TRADITIONAL_PLAN_REQUIREMENTS: readonly TraditionalPlanRequirement[] = [
  { key: 'sex', label: '性别', onboardingStep: 0 },
  { key: 'weightKg', label: '体重', onboardingStep: 0 },
  { key: 'goal', label: '训练目标', onboardingStep: 1 },
  { key: 'experience', label: '训练经验', onboardingStep: 1 },
  { key: 'daysPerWeek', label: '每周训练天数', onboardingStep: 2 },
  { key: 'trainingLocation', label: '训练地点', onboardingStep: 3 },
];

export function getMissingTraditionalPlanRequirements(
  profile: UserProfile,
): TraditionalPlanRequirement[] {
  const missing = TRADITIONAL_PLAN_REQUIREMENTS.filter((requirement) => {
    const value = profile[requirement.key];
    return value === undefined || value === null;
  });
  if (
    (profile.trainingLocation === 'gym' || profile.trainingLocation === 'home') &&
    !profile.gymEquipmentIds?.length
  ) {
    missing.push({
      key: 'gymEquipmentIds',
      label: '可用器械',
      onboardingStep: 3,
    });
  }
  return missing;
}
