import { describe, expect, it } from '@jest/globals';

import { mapHealthWorkout, normalizeBodyFat } from '../health-mapping';

describe('Apple Health mapping', () => {
  it('maps a running workout and converts meters to kilometers', () => {
    expect(
      mapHealthWorkout({
        uuid: 'workout-1',
        workoutActivityType: 37,
        startDate: new Date('2026-07-20T08:00:00+08:00'),
        endDate: new Date('2026-07-20T08:30:00+08:00'),
        duration: { quantity: 1800 },
        totalDistance: { quantity: 5000, unit: 'm' },
      }),
    ).toMatchObject({
      type: 'running',
      durationMin: 30,
      distanceKm: 5,
      externalId: 'healthkit:workout-1',
    });
  });

  it('does not flatten strength workouts into cardio logs', () => {
    expect(
      mapHealthWorkout({
        uuid: 'strength-1',
        workoutActivityType: 50,
        startDate: new Date(),
        endDate: new Date(),
      }),
    ).toBeNull();
  });

  it('normalizes fractional body-fat values', () => {
    expect(normalizeBodyFat(0.185)).toBeCloseTo(18.5);
    expect(normalizeBodyFat(18.5)).toBe(18.5);
  });
});
