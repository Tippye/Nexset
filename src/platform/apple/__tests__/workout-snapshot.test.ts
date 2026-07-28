import { describe, expect, it } from '@jest/globals';

import { parseWatchWorkoutCommand } from '../workout-snapshot';

describe('Watch workout commands', () => {
  it('parses an automatic set and preserves its confidence', () => {
    expect(
      parseWatchWorkoutCommand({
        eventId: 'watch-event-1',
        type: 'logSet',
        sessionId: 'session-1',
        weightKg: 42.5,
        reps: 8,
        source: 'watch_auto',
        confidence: 0.82,
      }),
    ).toEqual({
      eventId: 'watch-event-1',
      type: 'logSet',
      sessionId: 'session-1',
      weightKg: 42.5,
      reps: 8,
      source: 'watch_auto',
      confidence: 0.82,
    });
  });

  it('rejects events without a stable id', () => {
    expect(parseWatchWorkoutCommand({ type: 'startWorkout' })).toBeNull();
  });

  it('normalizes invalid manual values without accepting an automatic confidence', () => {
    expect(
      parseWatchWorkoutCommand({
        eventId: 'watch-event-2',
        type: 'logSet',
        weightKg: '20',
        reps: Number.NaN,
        source: 'watch_manual',
        confidence: 0.99,
      }),
    ).toMatchObject({
      weightKg: null,
      reps: null,
      source: 'watch_manual',
      confidence: null,
    });
  });
});
