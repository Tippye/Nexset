import { isAIConfigured } from '@/ai/config';
import { completeAI } from '@/ai/provider';
import type { AIComplete, AIConfig } from '@/ai/types';

import type { IntelligenceProvider } from '../types';

export function createCustomCloudProvider(
  config: AIConfig | null,
  complete: AIComplete = completeAI,
): IntelligenceProvider {
  return {
    id: 'custom-cloud',
    displayName: '自定义 LLM 服务',
    kind: 'cloud',
    priority: 20,
    model: config?.model.trim() || 'unconfigured',
    capabilities: {
      text_generation: true,
      structured_output: true,
      tool_calling: config?.supportsTools !== false,
      streaming: true,
    },
    availability: async () => ({
      available: isAIConfigured(config),
      reason: isAIConfigured(config) ? '自定义云端模型已配置' : '尚未配置可用的自定义 LLM 服务',
    }),
    complete: async (request) => {
      if (!isAIConfigured(config)) throw new Error('自定义 LLM 服务未配置');
      return complete(config, request);
    },
  };
}
