import { eq } from 'drizzle-orm';

import { newId } from '@/lib/id';

import { agentLogs } from '../schema';
import type { DB } from '../types';

export type AgentValidationResult = 'pass' | 'retry_pass' | 'fail';
export type AgentUserDecision = 'accept' | 'partial' | 'reject';

export async function createAgentLog(
  db: DB,
  input: {
    agent: string;
    promptVersion: string;
    inputSummary?: string;
    output?: unknown;
    validationResult: AgentValidationResult;
    latencyMs?: number;
    isBadcase?: boolean;
  },
): Promise<string> {
  const id = newId();
  await db.insert(agentLogs).values({
    id,
    agent: input.agent,
    promptVersion: input.promptVersion,
    inputSummary: input.inputSummary ?? null,
    outputJson: input.output === undefined ? null : JSON.stringify(input.output),
    validationResult: input.validationResult,
    userDecision: null,
    latencyMs: input.latencyMs ?? null,
    isBadcase: input.isBadcase ?? false,
    createdAt: Date.now(),
  });
  return id;
}

export async function updateAgentDecision(
  db: DB,
  logId: string,
  decision: AgentUserDecision,
): Promise<void> {
  await db.update(agentLogs).set({ userDecision: decision }).where(eq(agentLogs.id, logId));
}
