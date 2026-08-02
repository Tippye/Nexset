import type { AIUsage } from '@/ai/types';

import type { IntelligenceExecution, IntelligenceRouteAttempt, IntelligenceTokenPricing } from './types';

export function estimateCostUsdMicros(
  usage: AIUsage | undefined,
  pricing: IntelligenceTokenPricing | undefined,
): number {
  if (!usage || !pricing) return 0;
  const usd =
    ((usage.inputTokens ?? 0) * pricing.inputPerMillionUsd +
      (usage.outputTokens ?? 0) * pricing.outputPerMillionUsd) /
    1_000_000;
  return Math.max(0, Math.round(usd * 1_000_000));
}

export function executionWasDegraded(execution: Pick<IntelligenceExecution<unknown>, 'attempts'>): boolean {
  return execution.attempts.some((attempt) => attempt.status !== 'success');
}

export function attemptsWereDegraded(attempts: IntelligenceRouteAttempt[]): boolean {
  return attempts.some((attempt) => attempt.status !== 'success');
}
