import { Platform } from 'react-native';

import type { AIMessage, AIRequest, AIResponse, AIToolCall } from '@/ai/types';
import { newId } from '@/lib/id';

import { isLocalModelConfigured, type LocalModelConfig } from '../local-model-config';
import type { IntelligenceProvider } from '../types';

type LlamaModule = typeof import('llama.rn');
type LlamaContext = Awaited<ReturnType<LlamaModule['initLlama']>>;

let cached: { key: string; context: LlamaContext } | null = null;

export function createLocalGgufProvider(config: LocalModelConfig | null): IntelligenceProvider {
  const model = config ? `${config.modelId}:${config.quantization}` : 'unconfigured';
  return {
    id: 'local-gguf',
    displayName: config?.modelId === 'qwen3.5-4b' ? 'Qwen3.5-4B（端侧）' : 'MiniCPM5-1B（端侧）',
    kind: 'on_device',
    priority: 10,
    model,
    capabilities: {
      text_generation: true,
      structured_output: true,
      tool_calling: true,
      streaming: true,
    },
    pricing: { inputPerMillionUsd: 0, outputPerMillionUsd: 0 },
    availability: async () => {
      if (Platform.OS === 'web') return { available: false, reason: 'Web 端不支持 GGUF 原生推理' };
      if (!isLocalModelConfigured(config)) {
        return { available: false, reason: '尚未配置有效的 GGUF 模型文件' };
      }
      return { available: true, reason: `${model} 已配置` };
    },
    complete: async (request) => {
      if (!isLocalModelConfigured(config)) throw new Error('端侧 GGUF 模型未配置');
      return completeLocal(config, request);
    },
  };
}

async function completeLocal(config: LocalModelConfig, request: AIRequest): Promise<AIResponse> {
  const context = await getContext(config);
  const response = await context.completion(
    {
      messages: request.messages.map(toLlamaMessage),
      tools: request.tools?.length ? request.tools.map(toLlamaTool) : undefined,
      tool_choice: toLlamaToolChoice(request.toolChoice),
      n_predict: request.maxTokens ?? 2048,
      temperature: request.temperature ?? 0.2,
      jinja: true,
    },
    (token) => {
      const delta = token.content ?? token.token;
      if (delta) request.onText?.(delta);
    },
  );
  return {
    content: response.content || response.text,
    toolCalls: response.tool_calls.map((call): AIToolCall => ({
      id: call.id ?? `local_${newId()}`,
      name: call.function.name,
      input: parseToolArguments(call.function.arguments),
    })),
    usage: {
      inputTokens: response.tokens_evaluated,
      outputTokens: response.tokens_predicted,
    },
    raw: response,
  };
}

async function getContext(config: LocalModelConfig): Promise<LlamaContext> {
  const key = `${config.modelPath}|${config.contextSize}|${config.gpuLayers}`;
  if (cached?.key === key) return cached.context;
  if (cached) await cached.context.release();
  const { initLlama } = await import('llama.rn');
  const context = await initLlama({
    model: config.modelPath,
    n_ctx: config.contextSize,
    n_gpu_layers: config.gpuLayers,
  });
  cached = { key, context };
  return context;
}

function toLlamaMessage(message: AIMessage): { role: string; content: string } {
  if (message.role === 'tool') {
    return { role: 'tool', content: message.content };
  }
  const toolCalls = message.toolCalls?.length
    ? `\n\n工具调用记录：${JSON.stringify(message.toolCalls)}`
    : '';
  return { role: message.role, content: `${message.content}${toolCalls}` };
}

function toLlamaTool(tool: NonNullable<AIRequest['tools']>[number]) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

function toLlamaToolChoice(choice: AIRequest['toolChoice']): string | undefined {
  if (!choice || choice === 'auto' || choice === 'required' || choice === 'none') return choice;
  return choice.name;
}

function parseToolArguments(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}
