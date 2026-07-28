import { Platform } from 'react-native';

import { getDb } from '@/db/client';
import {
  addBodyMetric,
  getMetricHistory,
  type BodyMetricKind,
} from '@/db/repositories/body-repo';
import { addCardioLog } from '@/db/repositories/cardio-repo';
import { localDate } from '@/lib/id';

import { mapHealthWorkout, normalizeBodyFat } from './health-mapping';
import { loadApplePreferences, saveApplePreferences } from './preferences';

const WORKOUT = 'HKWorkoutTypeIdentifier' as const;
const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass' as const;
const BODY_FAT = 'HKQuantityTypeIdentifierBodyFatPercentage' as const;
const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate' as const;
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;

export type HealthSyncResult = {
  workoutsImported: number;
  bodyMetricsImported: number;
  syncedAt: number;
};

async function healthKit() {
  if (Platform.OS !== 'ios') throw new Error('Apple 健康仅在 iPhone 上可用');
  return import('@kingstinct/react-native-healthkit');
}

export async function isAppleHealthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const health = await healthKit();
    return await health.isHealthDataAvailableAsync();
  } catch {
    return false;
  }
}

export async function authorizeAppleHealth(): Promise<boolean> {
  const health = await healthKit();
  if (!(await health.isHealthDataAvailableAsync())) {
    throw new Error('当前设备不支持 Apple 健康数据');
  }
  const granted = await health.requestAuthorization({
    toRead: [WORKOUT, BODY_MASS, BODY_FAT, HEART_RATE, ACTIVE_ENERGY],
    toShare: [WORKOUT, BODY_MASS, BODY_FAT, ACTIVE_ENERGY],
  });
  if (granted) await saveApplePreferences({ healthEnabled: true });
  return granted;
}

async function importBodyQuantity(
  identifier: typeof BODY_MASS | typeof BODY_FAT,
  metric: BodyMetricKind,
  unit: 'kg' | '%',
  since: Date,
): Promise<number> {
  const health = await healthKit();
  const samples = await health.queryQuantitySamples(identifier, {
    limit: 200,
    ascending: true,
    unit,
    filter: { date: { startDate: since } },
  });
  const history = await getMetricHistory(getDb(), metric, localDate(since));
  const known = new Set(history.map((row) => `${row.date}:${row.value.toFixed(3)}`));
  let imported = 0;
  for (const sample of samples) {
    const date = localDate(sample.startDate);
    const rawValue = metric === 'body_fat_pct' ? normalizeBodyFat(sample.quantity) : sample.quantity;
    const value = Math.round(rawValue * 100) / 100;
    const key = `${date}:${value.toFixed(3)}`;
    if (known.has(key)) continue;
    await addBodyMetric(getDb(), metric, value, date);
    known.add(key);
    imported += 1;
  }
  return imported;
}

export async function syncAppleHealth(days = 30): Promise<HealthSyncResult> {
  const preferences = await loadApplePreferences();
  if (!preferences.healthEnabled) throw new Error('请先授权 Apple 健康');
  const health = await healthKit();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const workouts = await health.queryWorkoutSamples({
    limit: 300,
    ascending: true,
    filter: { date: { startDate: since } },
  });

  let workoutsImported = 0;
  for (const workout of workouts) {
    const mapped = mapHealthWorkout(workout);
    if (!mapped) continue;
    const heartRates = await health.queryQuantitySamples(HEART_RATE, {
      limit: -1,
      ascending: true,
      unit: 'count/min',
      filter: { workout },
    });
    const avgHr = heartRates.length
      ? Math.round(heartRates.reduce((sum, sample) => sum + sample.quantity, 0) / heartRates.length)
      : null;
    const id = await addCardioLog(getDb(), {
      ...mapped,
      avgHr,
      source: 'health_import',
      note: '由 Apple 健康同步',
    });
    if (id) workoutsImported += 1;
  }

  const bodyCounts = await Promise.all([
    importBodyQuantity(BODY_MASS, 'weight_kg', 'kg', since),
    importBodyQuantity(BODY_FAT, 'body_fat_pct', '%', since),
  ]);
  const syncedAt = Date.now();
  await saveApplePreferences({ lastHealthSyncAt: syncedAt });
  return {
    workoutsImported,
    bodyMetricsImported: bodyCounts[0] + bodyCounts[1],
    syncedAt,
  };
}

export async function exportStrengthWorkoutToAppleHealth(input: {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  totalVolumeKg: number;
}): Promise<boolean> {
  const preferences = await loadApplePreferences();
  if (!preferences.healthEnabled || Platform.OS !== 'ios') return false;
  const health = await healthKit();
  await health.saveWorkoutSample(
    health.WorkoutActivityType.traditionalStrengthTraining,
    [],
    new Date(input.startedAt),
    new Date(input.endedAt),
    undefined,
    {
      NexsetSessionId: input.sessionId,
      NexsetTotalVolumeKg: input.totalVolumeKg,
    },
  );
  return true;
}

export async function saveBodyMetricToAppleHealth(
  metric: 'weight_kg' | 'body_fat_pct',
  value: number,
  at = new Date(),
): Promise<void> {
  const preferences = await loadApplePreferences();
  if (!preferences.healthEnabled) return;
  const health = await healthKit();
  if (metric === 'weight_kg') {
    await health.saveQuantitySample(BODY_MASS, 'kg', value, at, at);
  } else {
    await health.saveQuantitySample(BODY_FAT, '%', value, at, at);
  }
}
