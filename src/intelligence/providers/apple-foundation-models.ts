import type { AIMessage, AIRequest, AIResponse } from '@/ai/types';
import {
  generateWithAppleIntelligence,
  getAppleIntelligenceAvailability,
} from '@/platform/apple/apple-intelligence';

import type { IntelligenceProvider } from '../types';

export function createAppleFoundationModelsProvider(): IntelligenceProvider {
  return {
    id: 'apple-foundation-models',
    displayName: 'Apple Intelligence',
    kind: 'on_device',
    priority: 10,
    model: 'system-language-model-default',
    capabilities: {
      text_generation: true,
      structured_output: true,
      tool_calling: false,
      streaming: false,
    },
    availability: getAppleIntelligenceAvailability,
    complete: completeWithAppleFoundationModels,
  };
}

async function completeWithAppleFoundationModels(request: AIRequest): Promise<AIResponse> {
  const instructions = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const prompt = request.messages
    .filter((message) => message.role !== 'system')
    .map(toPromptLine)
    .join('\n\n');
  const content = await generateWithAppleIntelligence(instructions, prompt);
  request.onText?.(content);
  return {
    content,
    toolCalls: [],
    raw: { provider: 'apple-foundation-models' },
  };
}

function toPromptLine(message: AIMessage): string {
  if (message.role === 'tool') return `工具结果 (${message.toolCallId ?? 'unknown'}): ${message.content}`;
  if (message.role === 'assistant') return `助手上次输出：${message.content}`;
  return `用户：${message.content}`;
}
