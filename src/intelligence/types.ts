import type { AIRequest, AIResponse } from '@/ai/types';

export type IntelligenceTask =
  | 'plan_generation'
  | 'daily_adjustment'
  | 'coach_chat'
  | 'general_assistance';

export type IntelligencePrivacyClass = 'local_only' | 'cloud_allowed';

export type IntelligenceCapability =
  | 'text_generation'
  | 'structured_output'
  | 'tool_calling'
  | 'streaming';

export type IntelligenceProviderKind = 'on_device' | 'cloud' | 'template';

export type IntelligenceRouteMode = 'single' | 'cascade' | 'system' | 'template';

export type IntelligenceTokenPricing = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

export type IntelligenceProviderCapabilities = Record<IntelligenceCapability, boolean>;

export type IntelligenceProviderAvailability = {
  available: boolean;
  reason: string;
};

export type IntelligenceProvider = {
  id: string;
  displayName: string;
  kind: IntelligenceProviderKind;
  priority: number;
  model: string;
  capabilities: IntelligenceProviderCapabilities;
  pricing?: IntelligenceTokenPricing;
  availability: () => Promise<IntelligenceProviderAvailability>;
  complete: (request: AIRequest) => Promise<AIResponse>;
};

export type IntelligencePolicy = {
  task: IntelligenceTask;
  privacyClass: IntelligencePrivacyClass;
  requiredCapabilities?: IntelligenceCapability[];
  preferredCapabilities?: IntelligenceCapability[];
};

export type IntelligenceRouteAttempt = {
  providerId: string;
  providerKind: IntelligenceProviderKind;
  model: string;
  status: 'unavailable' | 'incompatible' | 'failed' | 'success';
  reason: string;
};

export type IntelligenceProviderSession = Pick<
  IntelligenceProvider,
  'id' | 'displayName' | 'kind' | 'model' | 'capabilities' | 'complete'
> & { pricing?: IntelligenceTokenPricing };

export type IntelligenceExecution<T> = {
  result: T;
  provider: IntelligenceProviderSession;
  attempts: IntelligenceRouteAttempt[];
  routeReason: string;
  routeMode: IntelligenceRouteMode;
};

export type IntelligenceStatus = {
  available: boolean;
  providerId?: string;
  providerName?: string;
  model?: string;
  reason: string;
  attempts: IntelligenceRouteAttempt[];
  routeMode: IntelligenceRouteMode;
};
