import { describe, expect, it } from '@jest/globals';

import { resolveConversationProfile } from '@/lib/plan-conversation-profile';

describe('interactive plan profile resolution', () => {
  it('fills missing fields from clarified information', () => {
    expect(
      resolveConversationProfile(
        { goal: 'strength' },
        {
          goal: 'fat_loss',
          experience: 'novice',
          days_per_week: 3,
          session_minutes: 45,
          training_location: 'gym',
          equipment: ['barbell', 'dumbbell', 'machine'],
          injuries: ['knee'],
          weight_kg: 70,
        },
      ),
    ).toMatchObject({
      goal: 'strength',
      experience: 'novice',
      daysPerWeek: 3,
      sessionMinutes: 45,
      trainingLocation: 'gym',
      equipment: ['barbell', 'dumbbell', 'machine'],
      injuries: ['knee'],
      weightKg: 70,
    });
  });

  it('never overwrites explicit structured equipment or injuries', () => {
    expect(
      resolveConversationProfile(
        {
          equipment: ['bodyweight'],
          gymEquipmentIds: [],
          injuries: ['shoulder'],
        },
        {
          equipment: ['barbell'],
          injuries: ['knee'],
        },
      ),
    ).toMatchObject({
      equipment: ['bodyweight'],
      gymEquipmentIds: [],
      injuries: ['shoulder'],
    });
  });

  it('preserves an explicit empty injury list', () => {
    expect(
      resolveConversationProfile(
        { injuries: [] },
        {
          injuries: ['knee'],
        },
      ).injuries,
    ).toEqual([]);
  });

  it('keeps nullable conversation fields unknown', () => {
    expect(
      resolveConversationProfile(
        {},
        {
          equipment: null,
          injuries: null,
        },
      ),
    ).toEqual({});
  });
});
