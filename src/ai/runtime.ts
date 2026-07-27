import type { z } from 'zod';

import { extractJsonValue } from './json';
import { completeAI } from './provider';
import {
  type AIComplete,
  type AIConfig,
  type AIMessage,
  type AIResponse,
  type AIToolDefinition,
} from './types';

export type AgentTool = AIToolDefinition &
  (
    | { kind: 'read'; execute: (input: unknown) => Promise<unknown> }
    | { kind: 'propose' }
  );

export type OutputValidation<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] };

export type AgentDefinition<T> = {
  name: string;
  promptVersion: string;
  systemPrompt: string;
  outputDescription: string;
  tools: AgentTool[];
  validateOutput: (value: unknown) => OutputValidation<T>;
  proposalToolName?: string;
  maxToolRounds?: number;
  maxValidationRetries?: number;
};

export type AgentRunResult<T> = {
  data: T;
  raw: unknown;
  latencyMs: number;
  validationRetries: number;
  rounds: number;
};

export class AgentValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`AI 输出未通过校验：${errors.join('；')}`);
    this.name = 'AgentValidationError';
  }
}

export async function runAgent<T>(
  config: AIConfig,
  definition: AgentDefinition<T>,
  input: string,
  options: {
    complete?: AIComplete;
    onText?: (delta: string) => void;
    onProgress?: (message: string) => void;
  } = {},
): Promise<AgentRunResult<T>> {
  const started = Date.now();
  const complete = options.complete ?? completeAI;
  const toolMode = config.supportsTools !== false;
  const maxRounds = definition.maxToolRounds ?? 8;
  const maxValidationRetries = definition.maxValidationRetries ?? 2;
  let validationRetries = 0;
  const messages: AIMessage[] = [
    {
      role: 'system',
      content:
        definition.systemPrompt +
        (toolMode
          ? ''
          : `\n\n当前模型不支持工具调用。请直接输出一个 JSON 对象，格式必须满足：${definition.outputDescription}。可以放在 json 代码块中，不要输出其他内容。`),
    },
    { role: 'user', content: input },
  ];

  for (let round = 1; round <= maxRounds; round++) {
    options.onProgress?.(round === 1 ? '正在读取档案与动作约束…' : '正在校验并完善计划…');
    let streamed = '';
    const response = await complete(config, {
      messages: [...messages],
      tools: toolMode ? definition.tools : undefined,
      toolChoice: toolMode ? 'auto' : undefined,
      maxTokens: 6000,
      timeoutMs: 60_000,
      onText: options.onText
        ? (delta) => {
            streamed += delta;
            options.onText?.(delta);
          }
        : undefined,
    });
    const assistant = responseToMessage(response, streamed);
    messages.push(assistant);

    let handledReadTool = false;
    let proposalAttempted = false;
    for (const call of response.toolCalls) {
      const tool = definition.tools.find((item) => item.name === call.name);
      if (!tool) {
        messages.push(toolResult(call.id, { error: `未知工具：${call.name}` }));
        handledReadTool = true;
        continue;
      }
      if (tool.kind === 'read') {
        try {
          messages.push(toolResult(call.id, await tool.execute(call.input)));
        } catch (error) {
          messages.push(
            toolResult(call.id, {
              error: error instanceof Error ? error.message : '工具执行失败',
            }),
          );
        }
        handledReadTool = true;
        continue;
      }
      if (call.name === (definition.proposalToolName ?? call.name)) {
        proposalAttempted = true;
        const valid = definition.validateOutput(call.input);
        if (valid.success) {
          return {
            data: valid.data,
            raw: call.input,
            latencyMs: Date.now() - started,
            validationRetries,
            rounds: round,
          };
        }
        validationRetries += 1;
        messages.push(toolResult(call.id, { accepted: false, validation_errors: valid.errors }));
        if (validationRetries > maxValidationRetries) throw new AgentValidationError(valid.errors);
      }
    }

    if (proposalAttempted) continue;
    if (handledReadTool) continue;

    const text = response.content || streamed;
    if (text.trim()) {
      const parsed = tryExtract(text);
      if (parsed.ok) {
        const valid = definition.validateOutput(parsed.value);
        if (valid.success) {
          return {
            data: valid.data,
            raw: parsed.value,
            latencyMs: Date.now() - started,
            validationRetries,
            rounds: round,
          };
        }
        validationRetries += 1;
        if (validationRetries > maxValidationRetries) throw new AgentValidationError(valid.errors);
        messages.push({
          role: 'user',
          content: `上次输出未通过校验：${valid.errors.join('；')}。请修正后重新提交完整结果。`,
        });
        continue;
      }
    }

    validationRetries += 1;
    const errors = ['没有收到可校验的计划 JSON 或 propose_plan 工具调用'];
    if (validationRetries > maxValidationRetries) throw new AgentValidationError(errors);
    messages.push({
      role: 'user',
      content: `${errors[0]}。请按要求提交完整结果，不要只解释。`,
    });
  }
  throw new AgentValidationError(['工具调用轮次超过上限']);
}

export function zodOutputValidator<T>(schema: z.ZodType<T>): (value: unknown) => OutputValidation<T> {
  return (value) => {
    const result = schema.safeParse(value);
    if (result.success) return { success: true, data: result.data };
    return {
      success: false,
      errors: result.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
    };
  };
}

function responseToMessage(response: AIResponse, streamed: string): AIMessage {
  return {
    role: 'assistant',
    content: response.content || streamed,
    toolCalls: response.toolCalls,
  };
}

function toolResult(toolCallId: string, value: unknown): AIMessage {
  return {
    role: 'tool',
    toolCallId,
    content: JSON.stringify(value),
  };
}

function tryExtract(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: extractJsonValue(text) };
  } catch {
    return { ok: false };
  }
}
