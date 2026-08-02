import { describe, expect, it, jest } from '@jest/globals';

import type { AIConfig } from '@/ai/types';

import { createDefaultIntelligenceRouter, defaultIntelligencePolicy } from '../default-router';
import type { LocalModelConfig } from '../local-model-config';

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('@/ai/config', () => ({
  isAIConfigured: (config: AIConfig | null) =>
    !!config?.apiKey && !!config.model && /^https?:\/\//.test(config.baseUrl),
}));
jest.mock('../local-model-config', () => ({
  isLocalModelConfigured: (config: LocalModelConfig | null) =>
    !!config?.enabled && config.modelPath.endsWith('.gguf'),
  loadLocalModelConfig: async () => null,
}));
jest.mock('../providers/apple-foundation-models', () => ({
  createAppleFoundationModelsProvider: () => ({
    id: 'apple-foundation-models',
    displayName: 'Apple Intelligence',
    kind: 'on_device',
    priority: 10,
    model: 'system-language-model-default',
    capabilities: {
      text_generation: true,
      structured_output: true,
      tool_calling: false,
      streaming: false,
    },
    availability: async () => ({ available: false, reason: 'not used' }),
    complete: async () => ({ content: '', toolCalls: [] }),
  }),
}));

const cloud: AIConfig = {
  protocol: 'openai',
  baseUrl: 'https://example.com/v1',
  model: 'cloud-model',
  apiKey: 'secret',
  supportsTools: true,
};
const local: LocalModelConfig = {
  enabled: true,
  modelId: 'minicpm5-1b',
  modelPath: 'file:///models/minicpm5-q4.gguf',
  quantization: 'Q4_K_M',
  contextSize: 4096,
  gpuLayers: 99,
};
const policy = defaultIntelligencePolicy('plan_generation');

describe('default intelligence topology', () => {
  it('uses one configured cloud model without on-device collaboration', async () => {
    const status = await createDefaultIntelligenceRouter(cloud).inspect(policy);
    expect(status).toMatchObject({ providerId: 'custom-cloud', routeMode: 'single' });
    expect(status.attempts).toHaveLength(0);
  });

  it('uses one configured local model without cloud collaboration', async () => {
    const result = await createDefaultIntelligenceRouter(null, { localModelConfig: local }).execute(
      policy,
      async (provider) => provider.id,
    );
    expect(result).toMatchObject({ result: 'local-gguf', routeMode: 'single' });
    expect(result.attempts).toHaveLength(1);
  });

  it('enables local-first cascade only when local and cloud models are both configured', async () => {
    const result = await createDefaultIntelligenceRouter(cloud, { localModelConfig: local }).execute(
      policy,
      async (provider) => provider.id,
    );
    expect(result).toMatchObject({ result: 'local-gguf', routeMode: 'cascade' });
  });
});
