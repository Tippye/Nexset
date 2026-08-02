import type {
  IntelligenceExecution,
  IntelligencePolicy,
  IntelligenceProvider,
  IntelligenceProviderSession,
  IntelligenceRouteAttempt,
  IntelligenceRouteMode,
  IntelligenceStatus,
} from './types';

export class IntelligenceRoutingError extends Error {
  constructor(
    public readonly attempts: IntelligenceRouteAttempt[],
    public readonly routeMode: IntelligenceRouteMode = 'single',
  ) {
    super(
      attempts.length
        ? attempts.map((attempt) => `${attempt.providerId}: ${attempt.reason}`).join('；')
        : '没有已注册的智能服务 Provider',
    );
    this.name = 'IntelligenceRoutingError';
  }
}

export class IntelligenceRouter {
  private readonly providers: IntelligenceProvider[];
  private readonly routeMode: IntelligenceRouteMode;

  constructor(providers: IntelligenceProvider[], routeMode?: IntelligenceRouteMode) {
    this.providers = [...providers].sort((a, b) => a.priority - b.priority);
    this.routeMode = routeMode ?? (providers.length > 1 ? 'cascade' : 'single');
  }

  async inspect(policy: IntelligencePolicy): Promise<IntelligenceStatus> {
    const { candidates, attempts } = await this.resolveCandidates(policy);
    const provider = candidates[0];
    if (!provider) {
      return {
        available: false,
        reason: attempts.at(-1)?.reason ?? '当前没有可用的智能服务',
        attempts,
        routeMode: this.routeMode,
      };
    }
    return {
      available: true,
      providerId: provider.id,
      providerName: provider.displayName,
      model: provider.model,
      reason: routeReason(provider, attempts, this.routeMode),
      attempts,
      routeMode: this.routeMode,
    };
  }

  async execute<T>(
    policy: IntelligencePolicy,
    operation: (provider: IntelligenceProviderSession) => Promise<T>,
  ): Promise<IntelligenceExecution<T>> {
    const { candidates, attempts } = await this.resolveCandidates(policy);

    for (const provider of candidates) {
      const session = toSession(provider);
      try {
        const result = await operation(session);
        const completedAttempts = [
          ...attempts,
          {
            providerId: provider.id,
            providerKind: provider.kind,
            model: provider.model,
            status: 'success' as const,
            reason: provider.kind === 'on_device' ? '设备端执行成功' : '云端执行成功',
          },
        ];
        return {
          result,
          provider: session,
          attempts: completedAttempts,
          routeReason: routeReason(provider, completedAttempts, this.routeMode),
          routeMode: this.routeMode,
        };
      } catch (error) {
        attempts.push({
          providerId: provider.id,
          providerKind: provider.kind,
          model: provider.model,
          status: 'failed',
          reason: safeErrorMessage(error),
        });
      }
    }

    throw new IntelligenceRoutingError(attempts, this.routeMode);
  }

  private async resolveCandidates(policy: IntelligencePolicy): Promise<{
    candidates: IntelligenceProvider[];
    attempts: IntelligenceRouteAttempt[];
  }> {
    const attempts: IntelligenceRouteAttempt[] = [];
    const candidates: IntelligenceProvider[] = [];

    for (const provider of this.providers) {
      if (policy.privacyClass === 'local_only' && provider.kind === 'cloud') {
        attempts.push({
          providerId: provider.id,
          providerKind: provider.kind,
          model: provider.model,
          status: 'incompatible',
          reason: '任务要求仅在设备端处理',
        });
        continue;
      }
      const missing = (policy.requiredCapabilities ?? []).filter(
        (capability) => !provider.capabilities[capability],
      );
      if (missing.length) {
        attempts.push({
          providerId: provider.id,
          providerKind: provider.kind,
          model: provider.model,
          status: 'incompatible',
          reason: `缺少能力：${missing.join(', ')}`,
        });
        continue;
      }
      let availability;
      try {
        availability = await provider.availability();
      } catch (error) {
        availability = { available: false, reason: safeErrorMessage(error) };
      }
      if (!availability.available) {
        attempts.push({
          providerId: provider.id,
          providerKind: provider.kind,
          model: provider.model,
          status: 'unavailable',
          reason: availability.reason,
        });
        continue;
      }
      candidates.push(provider);
    }

    return { candidates: preferCapabilities(candidates, policy), attempts };
  }
}

function preferCapabilities(
  providers: IntelligenceProvider[],
  policy: IntelligencePolicy,
): IntelligenceProvider[] {
  const preferred = policy.preferredCapabilities ?? [];
  if (!preferred.length) return providers;
  return [...providers].sort((a, b) => {
    const aScore = preferred.filter((capability) => a.capabilities[capability]).length;
    const bScore = preferred.filter((capability) => b.capabilities[capability]).length;
    return a.priority - b.priority || bScore - aScore;
  });
}

function toSession(provider: IntelligenceProvider): IntelligenceProviderSession {
  return {
    id: provider.id,
    displayName: provider.displayName,
    kind: provider.kind,
    model: provider.model,
    capabilities: provider.capabilities,
    pricing: provider.pricing,
    complete: provider.complete,
  };
}

function routeReason(
  provider: IntelligenceProvider,
  attempts: IntelligenceRouteAttempt[],
  routeMode: IntelligenceRouteMode,
): string {
  if (routeMode === 'single') {
    return provider.kind === 'cloud'
      ? '单模型模式：统一使用已配置的云端模型'
      : '单模型模式：统一使用已配置的设备端模型';
  }
  if (routeMode === 'system') return '使用系统提供的设备端模型能力';
  if (provider.kind === 'on_device') return '优先使用可用的设备端模型';
  const onDeviceAttempt = attempts.find(
    (attempt) => attempt.providerKind === 'on_device' && attempt.status !== 'success',
  );
  return onDeviceAttempt
    ? `设备端不可用，已回退云端：${onDeviceAttempt.reason}`
    : '使用已配置的自定义云端模型';
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Provider 执行失败';
  return message.length > 180 ? `${message.slice(0, 180)}…` : message;
}
