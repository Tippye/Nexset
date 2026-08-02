import type { AIComplete, AIConfig } from '@/ai/types';

import { isAIConfigured } from '@/ai/config';
import {
  isLocalModelConfigured,
  loadLocalModelConfig,
  type LocalModelConfig,
} from './local-model-config';
import { createAppleFoundationModelsProvider } from './providers/apple-foundation-models';
import { createCustomCloudProvider } from './providers/custom-cloud';
import { createLocalGgufProvider } from './providers/local-gguf';
import { IntelligenceRouter } from './router';
import type {
  IntelligencePolicy,
  IntelligenceProvider,
  IntelligenceStatus,
  IntelligenceTask,
} from './types';

export function createDefaultIntelligenceRouter(
  config: AIConfig | null,
  options: {
    cloudComplete?: AIComplete;
    localModelConfig?: LocalModelConfig | null;
    extraProviders?: IntelligenceProvider[];
  } = {},
): IntelligenceRouter {
  const explicitlyConfigured: IntelligenceProvider[] = [];
  if (isLocalModelConfigured(options.localModelConfig)) {
    explicitlyConfigured.push(createLocalGgufProvider(options.localModelConfig));
  }
  if (isAIConfigured(config)) {
    explicitlyConfigured.push(createCustomCloudProvider(config, options.cloudComplete));
  }
  const extraProviders = options.extraProviders ?? [];
  if (explicitlyConfigured.length) {
    const providers = [...explicitlyConfigured, ...extraProviders];
    return new IntelligenceRouter(providers, providers.length === 1 ? 'single' : 'cascade');
  }
  const providers = [createAppleFoundationModelsProvider(), ...extraProviders];
  return new IntelligenceRouter(providers, 'system');
}

export function defaultIntelligencePolicy(task: IntelligenceTask): IntelligencePolicy {
  return {
    task,
    privacyClass: 'cloud_allowed',
    requiredCapabilities: ['text_generation', 'structured_output'],
    preferredCapabilities: ['tool_calling', 'streaming'],
  };
}

export async function getDefaultIntelligenceStatus(
  config: AIConfig | null,
  task: IntelligenceTask,
): Promise<IntelligenceStatus> {
  const localModelConfig = await loadLocalModelConfig();
  return createDefaultIntelligenceRouter(config, { localModelConfig }).inspect(
    defaultIntelligencePolicy(task),
  );
}
