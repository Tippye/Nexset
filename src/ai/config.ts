import { Platform } from 'react-native';

import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repositories/settings-repo';

import type { AIConfig, AIProtocol } from './types';

const CONFIG_KEY = 'ai_config';
const SECRET_KEY = 'nexset.ai.api_key';
const WEB_SECRET_KEY = 'nexset.ai.api_key.encrypted';
const WEB_SECRET_SALT = 'nexset-local-ai-config-v1';

type StoredAIConfig = Omit<AIConfig, 'apiKey'>;

export const WEB_KEY_WARNING =
  'Web 端只能在当前浏览器中加密保存 Key，仍可能被同源脚本读取。请使用限额 Key，并避免在公共设备上保存。';

export function defaultAIConfig(protocol: AIProtocol = 'openai'): AIConfig {
  return {
    protocol,
    baseUrl:
      protocol === 'anthropic'
        ? 'https://api.anthropic.com/v1'
        : 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    supportsTools: null,
  };
}

export async function loadAIConfig(): Promise<AIConfig | null> {
  const stored = await getSetting<StoredAIConfig>(getDb(), CONFIG_KEY);
  if (!stored) return null;
  return { ...stored, apiKey: await loadSecret() };
}

export async function saveAIConfig(config: AIConfig): Promise<void> {
  const { apiKey, ...metadata } = config;
  await saveSecret(apiKey.trim());
  await setSetting(getDb(), CONFIG_KEY, metadata);
}

export function isAIConfigured(config: AIConfig | null): config is AIConfig {
  return !!config?.apiKey.trim() && !!config.model.trim() && /^https?:\/\//i.test(config.baseUrl);
}

async function saveSecret(value: string): Promise<void> {
  if (Platform.OS !== 'web') {
    const SecureStore = await import('expo-secure-store');
    if (value) await SecureStore.setItemAsync(SECRET_KEY, value);
    else await SecureStore.deleteItemAsync(SECRET_KEY);
    return;
  }
  if (typeof localStorage === 'undefined') return;
  if (!value) {
    localStorage.removeItem(WEB_SECRET_KEY);
    return;
  }
  localStorage.setItem(WEB_SECRET_KEY, await encryptForWeb(value));
}

async function loadSecret(): Promise<string> {
  if (Platform.OS !== 'web') {
    const SecureStore = await import('expo-secure-store');
    return (await SecureStore.getItemAsync(SECRET_KEY)) ?? '';
  }
  if (typeof localStorage === 'undefined') return '';
  const encrypted = localStorage.getItem(WEB_SECRET_KEY);
  if (!encrypted) return '';
  try {
    return await decryptForWeb(encrypted);
  } catch {
    return '';
  }
}

async function webKey(): Promise<CryptoKey> {
  const seed = new TextEncoder().encode(`${WEB_SECRET_SALT}:${globalThis.location?.origin ?? 'local'}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', seed);
  return globalThis.crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encryptForWeb(value: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const cipher = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await webKey(),
    new TextEncoder().encode(value),
  );
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

async function decryptForWeb(value: string): Promise<string> {
  const [ivText, cipherText] = value.split('.');
  const clear = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(ivText) },
    await webKey(),
    base64ToBytes(cipherText),
  );
  return new TextDecoder().decode(clear);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
