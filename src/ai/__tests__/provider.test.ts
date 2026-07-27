import { describe, expect, it, jest } from '@jest/globals';

import { completeAIWithFetch, testAIConnection } from '../provider';
import type { AIComplete, AIConfig } from '../types';

const openAI: AIConfig = {
  protocol: 'openai',
  baseUrl: 'https://example.test/v1',
  model: 'test-model',
  apiKey: 'secret',
  supportsTools: true,
};

describe('AI provider', () => {
  it('maps OpenAI-compatible chat completions and tool calls', async () => {
    const fetchMock = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://example.test/v1/chat/completions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret');
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('test-model');
      expect(body.tools[0].function.name).toBe('submit');
      return jsonResponse({
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'submit', arguments: '{"ok":true}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      });
    }) as unknown as typeof fetch;

    const response = await completeAIWithFetch(
      openAI,
      {
        messages: [{ role: 'user', content: 'go' }],
        tools: [
          {
            name: 'submit',
            description: 'submit',
            inputSchema: { type: 'object' },
          },
        ],
        maxRetries: 0,
      },
      fetchMock,
    );

    expect(response.toolCalls).toEqual([{ id: 'call_1', name: 'submit', input: { ok: true } }]);
    expect(response.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
  });

  it('maps Anthropic Messages tool_use blocks', async () => {
    const fetchMock = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://anthropic.test/v1/messages');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-api-key')).toBe('anthropic-key');
      expect(headers.get('anthropic-version')).toBe('2023-06-01');
      const body = JSON.parse(String(init?.body));
      expect(body.system).toBe('system');
      expect(body.tools[0].input_schema).toEqual({ type: 'object' });
      return jsonResponse({
        content: [
          { type: 'text', text: 'done' },
          { type: 'tool_use', id: 'tool_1', name: 'submit', input: { ok: true } },
        ],
        usage: { input_tokens: 8, output_tokens: 3 },
      });
    }) as unknown as typeof fetch;

    const response = await completeAIWithFetch(
      {
        protocol: 'anthropic',
        baseUrl: 'https://anthropic.test/v1',
        model: 'claude-test',
        apiKey: 'anthropic-key',
        supportsTools: true,
      },
      {
        messages: [
          { role: 'system', content: 'system' },
          { role: 'user', content: 'go' },
        ],
        tools: [{ name: 'submit', description: 'submit', inputSchema: { type: 'object' } }],
        maxRetries: 0,
      },
      fetchMock,
    );

    expect(response.content).toBe('done');
    expect(response.toolCalls[0]).toEqual({
      id: 'tool_1',
      name: 'submit',
      input: { ok: true },
    });
  });

  it('assembles streamed OpenAI text and fragmented tool arguments', async () => {
    const chunks = [
      { choices: [{ delta: { content: '正在' } }] },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_1',
                  function: { name: 'submit', arguments: '{"ok":' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { arguments: 'true}' } }] } },
        ],
      },
    ];
    const fetchMock = jest.fn(async () =>
      new Response(
        `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
      ),
    ) as unknown as typeof fetch;
    let streamed = '';

    const response = await completeAIWithFetch(
      openAI,
      {
        messages: [{ role: 'user', content: 'go' }],
        maxRetries: 0,
        onText: (delta) => {
          streamed += delta;
        },
      },
      fetchMock,
    );

    expect(streamed).toBe('正在');
    expect(response.toolCalls[0]).toEqual({
      id: 'call_1',
      name: 'submit',
      input: { ok: true },
    });
  });

  it('falls back to JSON-in-text capability when tools are unsupported', async () => {
    const complete = jest
      .fn<AIComplete>()
      .mockRejectedValueOnce(new Error('tools unsupported'))
      .mockResolvedValueOnce({ content: 'OK', toolCalls: [] });

    const result = await testAIConnection(openAI, complete);

    expect(result.supportsTools).toBe(false);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
