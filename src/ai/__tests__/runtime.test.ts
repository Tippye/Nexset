import { describe, expect, it, jest } from '@jest/globals';
import { z } from 'zod';

import { runAgent, zodOutputValidator, type AgentDefinition } from '../runtime';
import type { AIComplete, AIConfig } from '../types';

const config: AIConfig = {
  protocol: 'openai',
  baseUrl: 'https://example.test/v1',
  model: 'test',
  apiKey: 'secret',
  supportsTools: true,
};

const ResultSchema = z.object({ value: z.number().int().positive() });
type Result = z.infer<typeof ResultSchema>;

function definition(): AgentDefinition<Result> {
  return {
    name: 'TestAgent',
    promptVersion: 'v1',
    systemPrompt: 'test',
    outputDescription: '{"value": number}',
    proposalToolName: 'propose',
    tools: [
      {
        kind: 'read',
        name: 'read_value',
        description: 'read',
        inputSchema: { type: 'object' },
        execute: async () => ({ current: 1 }),
      },
      {
        kind: 'propose',
        name: 'propose',
        description: 'propose',
        inputSchema: { type: 'object' },
      },
    ],
    validateOutput: zodOutputValidator(ResultSchema),
  };
}

describe('agent runtime', () => {
  it('runs read tools before accepting a proposal', async () => {
    const complete = jest
      .fn<AIComplete>()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'read_1', name: 'read_value', input: {} }],
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'proposal_1', name: 'propose', input: { value: 2 } }],
      });

    const result = await runAgent(config, definition(), 'go', { complete });

    expect(result.data).toEqual({ value: 2 });
    expect(result.rounds).toBe(2);
    const secondMessages = complete.mock.calls[1][1].messages;
    expect(secondMessages.at(-1)).toMatchObject({ role: 'tool', toolCallId: 'read_1' });
  });

  it('returns validation errors to the model and retries at most as configured', async () => {
    const complete = jest
      .fn<AIComplete>()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'bad', name: 'propose', input: { value: -1 } }],
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 'good', name: 'propose', input: { value: 3 } }],
      });

    const result = await runAgent(config, definition(), 'go', { complete });

    expect(result.data.value).toBe(3);
    expect(result.validationRetries).toBe(1);
    expect(complete.mock.calls[1][1].messages.at(-1)?.content).toContain('validation_errors');
  });

  it('extracts fenced JSON when function calling is disabled', async () => {
    const complete: AIComplete = async () => ({
      content: '```json\n{"value": 4}\n```',
      toolCalls: [],
    });

    const result = await runAgent(
      { ...config, supportsTools: false },
      definition(),
      'go',
      { complete },
    );

    expect(result.data.value).toBe(4);
  });
});
