import type { AIComplete, AIConfig } from '@/ai/types';

import { createAppleFoundationModelsProvider } from './providers/apple-foundation-models';
import { createCustomCloudProvider } from './providers/custom-cloud';
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
    extraProviders?: IntelligenceProvider[];
  } = {},
): IntelligenceRouter {
  return new IntelligenceRouter([
    createAppleFoundationModelsProvider(),
    createCustomCloudProvider(config, options.cloudComplete),
    ...(options.extraProviders ?? []),
  ]);
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
  return createDefaultIntelligenceRouter(config).inspect(defaultIntelligencePolicy(task));
}
