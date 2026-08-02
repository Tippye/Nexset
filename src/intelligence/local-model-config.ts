import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repositories/settings-repo';

export type LocalModelId = 'minicpm5-1b' | 'qwen3.5-4b';
export type LocalModelQuantization = 'Q4_K_M' | 'Q5_K_M' | 'custom';

export type LocalModelConfig = {
  enabled: boolean;
  modelId: LocalModelId;
  modelPath: string;
  quantization: LocalModelQuantization;
  contextSize: number;
  gpuLayers: number;
};

const CONFIG_KEY = 'local_model_config';

export function defaultLocalModelConfig(): LocalModelConfig {
  return {
    enabled: false,
    modelId: 'minicpm5-1b',
    modelPath: '',
    quantization: 'Q4_K_M',
    contextSize: 8192,
    gpuLayers: 99,
  };
}

export async function loadLocalModelConfig(): Promise<LocalModelConfig> {
  const stored = await getSetting<Partial<LocalModelConfig>>(getDb(), CONFIG_KEY);
  return normalizeLocalModelConfig(stored);
}

export async function saveLocalModelConfig(config: LocalModelConfig): Promise<void> {
  await setSetting(getDb(), CONFIG_KEY, normalizeLocalModelConfig(config));
}

export function isLocalModelConfigured(config: LocalModelConfig | null | undefined): config is LocalModelConfig {
  return !!config?.enabled && /\.gguf(?:$|[?#])/i.test(config.modelPath.trim());
}

function normalizeLocalModelConfig(input?: Partial<LocalModelConfig> | null): LocalModelConfig {
  const fallback = defaultLocalModelConfig();
  return {
    enabled: input?.enabled ?? fallback.enabled,
    modelId: input?.modelId === 'qwen3.5-4b' ? 'qwen3.5-4b' : 'minicpm5-1b',
    modelPath: input?.modelPath?.trim() ?? '',
    quantization:
      input?.quantization === 'Q5_K_M' || input?.quantization === 'custom'
        ? input.quantization
        : 'Q4_K_M',
    contextSize: clampInteger(input?.contextSize, 2048, 32768, fallback.contextSize),
    gpuLayers: clampInteger(input?.gpuLayers, 0, 999, fallback.gpuLayers),
  };
}

function clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value!)));
}
