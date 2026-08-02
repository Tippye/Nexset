import { gte } from 'drizzle-orm';

import type { IntelligenceProviderKind } from '@/intelligence/types';

import { agentLogs } from '../schema';
import type { DB } from '../types';

export type IntelligenceMetric = {
  providerKind: IntelligenceProviderKind | 'unknown';
  providerId: string;
  runs: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  passRate: number;
  estimatedCostUsd: number;
  degradationRate: number;
};

export async function getIntelligenceMetrics(
  db: DB,
  since = Date.now() - 30 * 86_400_000,
): Promise<IntelligenceMetric[]> {
  const rows = await db
    .select({
      providerKind: agentLogs.providerKind,
      providerId: agentLogs.providerId,
      validationResult: agentLogs.validationResult,
      latencyMs: agentLogs.latencyMs,
      estimatedCostUsdMicros: agentLogs.estimatedCostUsdMicros,
      degraded: agentLogs.degraded,
    })
    .from(agentLogs)
    .where(gte(agentLogs.createdAt, since));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.providerKind ?? 'unknown'}:${row.providerId ?? 'unknown'}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map((items) => {
    const latencies = items
      .map((item) => item.latencyMs)
      .filter((value): value is number => value != null)
      .sort((a, b) => a - b);
    return {
      providerKind: (items[0].providerKind as IntelligenceProviderKind | null) ?? 'unknown',
      providerId: items[0].providerId ?? 'unknown',
      runs: items.length,
      averageLatencyMs: latencies.length
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : 0,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      passRate: ratio(
        items.filter(
          (item) => item.validationResult === 'pass' || item.validationResult === 'retry_pass',
        ).length,
        items.length,
      ),
      estimatedCostUsd:
        items.reduce((sum, item) => sum + item.estimatedCostUsdMicros, 0) / 1_000_000,
      degradationRate: ratio(items.filter((item) => item.degraded).length, items.length),
    };
  });
}

function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  return values[Math.ceil(values.length * quantile) - 1];
}

function ratio(numerator: number, denominator: number): number {
  return denominator ? Math.round((numerator / denominator) * 10_000) / 10_000 : 0;
}
