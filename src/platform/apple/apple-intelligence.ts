import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type AppleIntelligenceAvailability = {
  available: boolean;
  reason: string;
};

type NexsetAppleNativeModule = {
  appleIntelligenceAvailability(): Promise<AppleIntelligenceAvailability>;
  respond(instructions: string, prompt: string): Promise<string>;
  consumePendingIntent(): Promise<string | null>;
};

function nativeModule(): NexsetAppleNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeModule<NexsetAppleNativeModule>('NexsetApple');
  } catch {
    return null;
  }
}

export async function getAppleIntelligenceAvailability(): Promise<AppleIntelligenceAvailability> {
  const module = nativeModule();
  if (!module) return { available: false, reason: '需要 iOS 原生开发构建' };
  return module.appleIntelligenceAvailability();
}

export async function generateWithAppleIntelligence(
  instructions: string,
  prompt: string,
): Promise<string> {
  const module = nativeModule();
  if (!module) throw new Error('Apple Intelligence 原生模块不可用');
  return module.respond(instructions, prompt);
}

export async function consumePendingAppleIntent(): Promise<string | null> {
  return nativeModule()?.consumePendingIntent() ?? null;
}
