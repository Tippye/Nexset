import { describe, expect, it } from '@jest/globals';

import { getMissingTraditionalPlanRequirements } from '../plan-profile-requirements';

describe('traditional plan profile requirements', () => {
  it('returns every missing field with its onboarding step', () => {
    expect(
      getMissingTraditionalPlanRequirements({
        sex: 'male',
        weightKg: 70,
        goal: 'hypertrophy',
      }),
    ).toEqual([
      { key: 'experience', label: '训练经验', onboardingStep: 1 },
      { key: 'daysPerWeek', label: '每周训练天数', onboardingStep: 2 },
      { key: 'trainingLocation', label: '训练地点', onboardingStep: 3 },
    ]);
  });

  it('accepts a complete traditional-generation profile', () => {
    expect(
      getMissingTraditionalPlanRequirements({
        sex: 'other',
        weightKg: 60,
        goal: 'endurance',
        experience: 'novice',
        daysPerWeek: 3,
        trainingLocation: 'bodyweight',
      }),
    ).toEqual([]);
  });

  it('requires equipment for gym and home training', () => {
    const profile = {
      sex: 'female' as const,
      weightKg: 60,
      goal: 'strength' as const,
      experience: 'intermediate' as const,
      daysPerWeek: 4,
      trainingLocation: 'gym' as const,
    };

    expect(getMissingTraditionalPlanRequirements(profile)).toEqual([
      { key: 'gymEquipmentIds', label: '可用器械', onboardingStep: 3 },
    ]);
    expect(
      getMissingTraditionalPlanRequirements({
        ...profile,
        gymEquipmentIds: ['barbell'],
      }),
    ).toEqual([]);
  });
});
