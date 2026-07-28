import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repositories/settings-repo';

export type WorkoutAudioMode = 'mix' | 'duck' | 'exclusive';

export type AppleIntegrationPreferences = {
  healthEnabled: boolean;
  hapticsEnabled: boolean;
  audioMode: WorkoutAudioMode;
  lastHealthSyncAt: number | null;
};

const SETTINGS_KEY = 'apple_integration';

export const DEFAULT_APPLE_PREFERENCES: AppleIntegrationPreferences = {
  healthEnabled: false,
  hapticsEnabled: true,
  audioMode: 'mix',
  lastHealthSyncAt: null,
};

let cachedPreferences = DEFAULT_APPLE_PREFERENCES;

export async function loadApplePreferences(): Promise<AppleIntegrationPreferences> {
  const stored = await getSetting<Partial<AppleIntegrationPreferences>>(getDb(), SETTINGS_KEY);
  cachedPreferences = { ...DEFAULT_APPLE_PREFERENCES, ...stored };
  return cachedPreferences;
}

export async function saveApplePreferences(
  patch: Partial<AppleIntegrationPreferences>,
): Promise<AppleIntegrationPreferences> {
  cachedPreferences = { ...cachedPreferences, ...patch };
  await setSetting(getDb(), SETTINGS_KEY, cachedPreferences);
  return cachedPreferences;
}

export function getCachedApplePreferences(): AppleIntegrationPreferences {
  return cachedPreferences;
}
