import { Platform } from 'react-native';

import type { WorkoutPresenceSnapshot } from './presence';
import { parseWatchWorkoutCommand, type WatchWorkoutCommand } from './workout-snapshot';

type Cleanup = () => void;

let activated = false;

export type WatchIntegrationStatus = {
  supported: boolean;
  paired: boolean;
  installed: boolean;
  reachable: boolean;
};

export async function getWatchIntegrationStatus(): Promise<WatchIntegrationStatus> {
  if (Platform.OS !== 'ios') {
    return { supported: false, paired: false, installed: false, reachable: false };
  }
  try {
    const { WatchConnectivity } = await import('@plevo/expo-watch-connectivity');
    if (!WatchConnectivity.isSupported) {
      return { supported: false, paired: false, installed: false, reachable: false };
    }
    if (!activated) {
      await WatchConnectivity.activate();
      activated = true;
    }
    const state = WatchConnectivity.sessionState;
    return {
      supported: state.isSupported,
      paired: state.isPaired,
      installed: state.isWatchAppInstalled,
      reachable: state.isReachable,
    };
  } catch {
    return { supported: false, paired: false, installed: false, reachable: false };
  }
}

export async function initializeWatchConnectivity(
  onCommand: (command: WatchWorkoutCommand) => Promise<Record<string, unknown>>,
): Promise<Cleanup> {
  if (Platform.OS !== 'ios') return () => undefined;
  try {
    const { WatchConnectivity } = await import('@plevo/expo-watch-connectivity');
    if (!WatchConnectivity.isSupported) return () => undefined;
    await WatchConnectivity.activate();
    activated = true;

    const handle = async (message: Record<string, unknown>, replyId?: string) => {
      const command = parseWatchWorkoutCommand(message);
      if (!command) {
        if (replyId) WatchConnectivity.replyToMessage(replyId, { ok: false, error: 'invalid_command' });
        return;
      }
      const reply = await onCommand(command);
      if (replyId) WatchConnectivity.replyToMessage(replyId, reply);
    };

    const messageSubscription = WatchConnectivity.addMessageListener(({ message, replyId }) => {
      void handle(message, replyId);
    });
    const userInfoSubscription = WatchConnectivity.addUserInfoListener(({ userInfo }) => {
      void handle(userInfo);
    });
    return () => {
      messageSubscription.remove();
      userInfoSubscription.remove();
      activated = false;
    };
  } catch {
    return () => undefined;
  }
}

export async function publishWatchWorkoutSnapshot(
  snapshot: WorkoutPresenceSnapshot | null,
): Promise<void> {
  if (Platform.OS !== 'ios' || !activated) return;
  try {
    const { WatchConnectivity } = await import('@plevo/expo-watch-connectivity');
    await WatchConnectivity.updateApplicationContext(
      snapshot
        ? { active: true, ...snapshot }
        : { active: false, title: 'Nexset', subtitle: '在手表上开始训练' },
    );
  } catch {
    // The latest state will be pushed again on the next workout store change.
  }
}
