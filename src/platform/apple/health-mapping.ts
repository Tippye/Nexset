import { localDate } from '@/lib/id';

export type HealthWorkoutLike = {
  uuid: string;
  workoutActivityType: number;
  startDate: Date;
  endDate: Date;
  duration?: { quantity: number };
  totalDistance?: { quantity: number; unit?: string };
};

export type ImportedCardio = {
  date: string;
  type: string;
  durationMin: number;
  distanceKm: number | null;
  externalId: string;
};

const CARDIO_ACTIVITY_NAMES: Record<number, string> = {
  13: 'cycling',
  16: 'elliptical',
  24: 'hiking',
  30: 'mixed_metabolic_cardio',
  35: 'rowing',
  37: 'running',
  43: 'squash',
  44: 'stair_climbing',
  46: 'swimming',
  48: 'tennis',
  52: 'walking',
  60: 'cross_country_skiing',
  63: 'hiit',
  64: 'jump_rope',
  68: 'stairs',
  73: 'mixed_cardio',
  74: 'hand_cycling',
  77: 'cardio_dance',
  82: 'triathlon',
  3000: 'other',
};

export function mapHealthWorkout(workout: HealthWorkoutLike): ImportedCardio | null {
  const type = CARDIO_ACTIVITY_NAMES[workout.workoutActivityType];
  if (!type) return null;
  const rawDuration = workout.duration?.quantity;
  const durationSec =
    typeof rawDuration === 'number' && rawDuration > 0
      ? rawDuration
      : Math.max(0, (workout.endDate.getTime() - workout.startDate.getTime()) / 1000);
  const distance = workout.totalDistance;
  let distanceKm: number | null = null;
  if (distance && Number.isFinite(distance.quantity)) {
    distanceKm = distance.unit === 'km' ? distance.quantity : distance.quantity / 1000;
  }
  return {
    date: localDate(workout.startDate),
    type,
    durationMin: Math.max(1, Math.round(durationSec / 60)),
    distanceKm,
    externalId: `healthkit:${workout.uuid}`,
  };
}

export function normalizeBodyFat(value: number): number {
  return value > 0 && value <= 1 ? value * 100 : value;
}
