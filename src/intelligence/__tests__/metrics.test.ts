import { describe, expect, it } from '@jest/globals';

import { estimateCostUsdMicros, executionWasDegraded } from '../metrics';

describe('intelligence observability', () => {
  it('estimates cloud cost from token usage and configured per-million prices', () => {
    expect(
      estimateCostUsdMicros(
        { inputTokens: 500_000, outputTokens: 100_000 },
        { inputPerMillionUsd: 2, outputPerMillionUsd: 8 },
      ),
    ).toBe(1_800_000);
    expect(estimateCostUsdMicros({ inputTokens: 100 }, undefined)).toBe(0);
  });

  it('marks a successful fallback as degraded', () => {
    expect(
      executionWasDegraded({
        attempts: [
          {
            providerId: 'local-gguf',
            providerKind: 'on_device',
            model: 'minicpm5-1b:Q4_K_M',
            status: 'failed',
            reason: '内存不足',
          },
          {
            providerId: 'custom-cloud',
            providerKind: 'cloud',
            model: 'cloud-model',
            status: 'success',
            reason: '云端执行成功',
          },
        ],
      }),
    ).toBe(true);
  });
});
