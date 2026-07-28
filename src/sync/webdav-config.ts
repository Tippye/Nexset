import { Platform } from 'react-native';

import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repositories/settings-repo';

const CONFIG_KEY = 'webdav_config';
const PASSWORD_KEY = 'nexset.webdav.password';

type StoredWebDavConfig = {
  baseUrl: string;
  username: string;
  connectedAt: number;
};

export type WebDavConfig = StoredWebDavConfig & {
  password: string;
};

export function defaultWebDavConfig(): WebDavConfig {
  return {
    baseUrl: '',
    username: '',
    password: '',
    connectedAt: 0,
  };
}

export async function loadWebDavConfig(): Promise<WebDavConfig | null> {
  const stored = await getSetting<StoredWebDavConfig>(getDb(), CONFIG_KEY);
  if (!stored) return null;
  return { ...stored, password: await loadPassword() };
}

export function isWebDavConfigured(config: WebDavConfig | null): config is WebDavConfig {
  return !!(
    config?.connectedAt &&
    isHttpsUrl(config.baseUrl) &&
    config.username.trim() &&
    config.password
  );
}

export async function testWebDavConnection(config: WebDavConfig): Promise<void> {
  const normalized = normalizeWebDavConfig(config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(normalized.baseUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: basicAuthorization(normalized.username, normalized.password),
        Depth: '0',
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error('用户名或密码不正确，或该账号没有目录访问权限');
    }
    if (!(response.ok || response.status === 207)) {
      throw new Error(`服务器返回状态 ${response.status}，请检查 WebDAV 目录地址`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('连接超时，请检查服务器地址和网络');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function saveWebDavConfig(config: WebDavConfig): Promise<WebDavConfig> {
  if (Platform.OS === 'web') {
    throw new Error('请在 Nexset 手机 App 中配置 WebDAV');
  }
  const normalized = normalizeWebDavConfig(config);
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync(PASSWORD_KEY, normalized.password);
  const stored: StoredWebDavConfig = {
    baseUrl: normalized.baseUrl,
    username: normalized.username,
    connectedAt: Date.now(),
  };
  await setSetting(getDb(), CONFIG_KEY, stored);
  return { ...stored, password: normalized.password };
}

export async function clearWebDavConfig(): Promise<void> {
  if (Platform.OS !== 'web') {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(PASSWORD_KEY);
  }
  await setSetting(getDb(), CONFIG_KEY, null);
}

function normalizeWebDavConfig(config: WebDavConfig): WebDavConfig {
  const baseUrl = config.baseUrl.trim();
  const username = config.username.trim();
  const password = config.password;
  if (!isHttpsUrl(baseUrl)) throw new Error('请输入有效的 HTTPS WebDAV 地址');
  if (!username) throw new Error('请输入用户名');
  if (!password) throw new Error('请输入密码或应用专用密码');
  return {
    ...config,
    baseUrl: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    username,
    password,
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

async function loadPassword(): Promise<string> {
  if (Platform.OS === 'web') return '';
  const SecureStore = await import('expo-secure-store');
  return (await SecureStore.getItemAsync(PASSWORD_KEY)) ?? '';
}

function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${bytesToBase64(bytes)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    const chunk = (first << 16) | (second << 8) | third;
    encoded += alphabet[(chunk >> 18) & 63];
    encoded += alphabet[(chunk >> 12) & 63];
    encoded += hasSecond ? alphabet[(chunk >> 6) & 63] : '=';
    encoded += hasThird ? alphabet[chunk & 63] : '=';
  }
  return encoded;
}
