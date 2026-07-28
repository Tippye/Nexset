import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { getCachedApplePreferences, type WorkoutAudioMode } from './preferences';

export type WorkoutHaptic = 'start' | 'set' | 'rest-complete' | 'finish' | 'warning';

export async function playWorkoutHaptic(kind: WorkoutHaptic): Promise<void> {
  if (Platform.OS === 'web' || !getCachedApplePreferences().hapticsEnabled) return;
  try {
    if (kind === 'start') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
    } else if (kind === 'warning') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    // Haptics are optional and should never interrupt a workout action.
  }
}

function interruptionMode(mode: WorkoutAudioMode): 'mixWithOthers' | 'duckOthers' | 'doNotMix' {
  if (mode === 'duck') return 'duckOthers';
  if (mode === 'exclusive') return 'doNotMix';
  return 'mixWithOthers';
}

export async function activateWorkoutAudio(mode = getCachedApplePreferences().audioMode) {
  if (Platform.OS === 'web') return;
  await setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: interruptionMode(mode),
    allowsRecording: false,
    shouldPlayInBackground: true,
    shouldRouteThroughEarpiece: false,
  });
  await setIsAudioActiveAsync(true);
}

export async function deactivateWorkoutAudio() {
  if (Platform.OS === 'web') return;
  try {
    await setIsAudioActiveAsync(false);
  } catch {
    // The audio session may already have been released by iOS.
  }
}
