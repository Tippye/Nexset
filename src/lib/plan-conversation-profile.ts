import type { Equipment } from '@/db/repositories/exercise-repo';
import type { UserProfile } from '@/db/repositories/profile-repo';

export const SEX_VALUES = ['male', 'female', 'other'] as const;
export const GOAL_VALUES = [
  'hypertrophy',
  'fat_loss',
  'strength',
  'endurance',
  'toning',
] as const;
export const EXPERIENCE_VALUES = ['novice', 'intermediate', 'advanced'] as const;
export const TRAINING_LOCATION_VALUES = ['gym', 'home', 'bodyweight'] as const;
export const EQUIPMENT_TYPES = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'cardio_machine',
  'other',
] as const satisfies readonly Equipment[];
export const INJURY_TAGS = [
  'shoulder',
  'lower_back',
  'knee',
  'elbow',
  'wrist',
  'hip',
  'ankle',
  'neck',
] as const;

export function resolveConversationProfile(
  profile: UserProfile,
  value: unknown,
): UserProfile {
  const input =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const injuries = stringArrayFrom(input.injuries, INJURY_TAGS);
  const equipment = stringArrayFrom(input.equipment, EQUIPMENT_TYPES);
  return {
    ...profile,
    sex: profile.sex ?? enumFrom(input.sex, SEX_VALUES),
    weightKg: profile.weightKg ?? boundedNumber(input.weight_kg, 25, 350),
    heightCm: profile.heightCm ?? boundedNumber(input.height_cm, 100, 250),
    birthYear:
      profile.birthYear ??
      boundedInteger(
        input.birth_year,
        new Date().getFullYear() - 100,
        new Date().getFullYear() - 12,
      ),
    goal: profile.goal ?? enumFrom(input.goal, GOAL_VALUES),
    experience: profile.experience ?? enumFrom(input.experience, EXPERIENCE_VALUES),
    daysPerWeek: profile.daysPerWeek ?? boundedInteger(input.days_per_week, 1, 7),
    sessionMinutes:
      profile.sessionMinutes ?? boundedInteger(input.session_minutes, 15, 240),
    trainingLocation:
      profile.trainingLocation ??
      enumFrom(input.training_location, TRAINING_LOCATION_VALUES),
    equipment: profile.equipment ?? equipment,
    injuries: profile.injuries ?? injuries,
  };
}

function enumFrom<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | undefined {
  return typeof value === 'string' && values.includes(value) ? value : undefined;
}

function stringArrayFrom<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter(
    (item): item is T[number] =>
      typeof item === 'string' && values.includes(item),
  );
  return [...new Set(filtered)];
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}
