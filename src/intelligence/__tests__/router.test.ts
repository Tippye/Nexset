import { describe, expect, it, jest } from '@jest/globals';

import { IntelligenceRouter } from '../router';
import type {
  IntelligencePolicy,
  IntelligenceProvider,
  IntelligenceProviderKind,
} from '../types';

const policy: IntelligencePolicy = {
  task: 'plan_generation',
  privacyClass: 'cloud_allowed',
  requiredCapabilities: ['text_generation', 'structured_output'],
  preferredCapabilities: ['tool_calling'],
};

describe('IntelligenceRouter', () => {
  it('prefers an available Apple on-device provider', async () => {
    const apple = provider({ id: 'apple-foundation-models', kind: 'on_device', priority: 10 });
    const cloud = provider({ id: 'custom-cloud', kind: 'cloud', priority: 20, tools: true });
    const operation = jest.fn(async (selected: { id: string }) => selected.id);

    const result = await new IntelligenceRouter([cloud, apple]).execute(policy, operation);

    expect(result.result).toBe('apple-foundation-models');
    expect(result.provider.kind).toBe('on_device');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('falls back to custom cloud when Apple is unavailable', async () => {
    const apple = provider({
      id: 'apple-foundation-models',
      kind: 'on_device',
      priority: 10,
      available: false,
      reason: '设备不支持',
    });
    const cloud = provider({ id: 'custom-cloud', kind: 'cloud', priority: 20 });

    const result = await new IntelligenceRouter([apple, cloud]).execute(
      policy,
      async (selected) => selected.id,
    );

    expect(result.result).toBe('custom-cloud');
    expect(result.routeReason).toContain('设备端不可用');
    expect(result.attempts[0]).toMatchObject({
      providerId: 'apple-foundation-models',
      status: 'unavailable',
    });
  });

  it('retries the whole operation on cloud when device execution fails validation', async () => {
    const apple = provider({ id: 'apple-foundation-models', kind: 'on_device', priority: 10 });
    const cloud = provider({ id: 'custom-cloud', kind: 'cloud', priority: 20 });

    const result = await new IntelligenceRouter([apple, cloud]).execute(policy, async (selected) => {
      if (selected.kind === 'on_device') throw new Error('结构校验失败');
      return 'validated-plan';
    });

    expect(result.result).toBe('validated-plan');
    expect(result.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerId: 'apple-foundation-models', status: 'failed' }),
        expect.objectContaining({ providerId: 'custom-cloud', status: 'success' }),
      ]),
    );
  });

  it('never sends local-only tasks to a cloud provider', async () => {
    const cloud = provider({ id: 'custom-cloud', kind: 'cloud', priority: 20 });
    const router = new IntelligenceRouter([cloud]);

    await expect(
      router.execute({ ...policy, privacyClass: 'local_only' }, async () => 'unexpected'),
    ).rejects.toMatchObject({
      attempts: [expect.objectContaining({ status: 'incompatible' })],
    });
  });

  it('uses declared capabilities as hard routing constraints', async () => {
    const apple = provider({ id: 'apple-foundation-models', kind: 'on_device', priority: 10 });
    const cloud = provider({ id: 'custom-cloud', kind: 'cloud', priority: 20, tools: true });

    const result = await new IntelligenceRouter([apple, cloud]).execute(
      { ...policy, requiredCapabilities: [...policy.requiredCapabilities!, 'tool_calling'] },
      async (selected) => selected.id,
    );

    expect(result.result).toBe('custom-cloud');
    expect(result.attempts[0]).toMatchObject({
      providerId: 'apple-foundation-models',
      status: 'incompatible',
    });
  });
});

function provider(options: {
  id: string;
  kind: IntelligenceProviderKind;
  priority: number;
  tools?: boolean;
  available?: boolean;
  reason?: string;
}): IntelligenceProvider {
  return {
    id: options.id,
    displayName: options.id,
    kind: options.kind,
    priority: options.priority,
    model: `${options.id}-model`,
    capabilities: {
      text_generation: true,
      structured_output: true,
      tool_calling: options.tools ?? false,
      streaming: options.kind === 'cloud',
    },
    availability: async () => ({
      available: options.available ?? true,
      reason: options.reason ?? '可用',
    }),
    complete: async () => ({ content: '', toolCalls: [] }),
  };
}
