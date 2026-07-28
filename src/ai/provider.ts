import {
  type AIComplete,
  type AIConfig,
  type AIMessage,
  AIProviderError,
  type AIRequest,
  type AIResponse,
  type AIToolCall,
} from './types';

type FetchLike = typeof fetch;

export const completeAI: AIComplete = (config, request) =>
  requestWithRetry(config, request, fetch);

export async function completeAIWithFetch(
  config: AIConfig,
  request: AIRequest,
  fetchImpl: FetchLike,
): Promise<AIResponse> {
  return requestWithRetry(config, request, fetchImpl);
}

async function requestWithRetry(
  config: AIConfig,
  request: AIRequest,
  fetchImpl: FetchLike,
): Promise<AIResponse> {
  const retries = Math.max(0, request.maxRetries ?? 1);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return config.protocol === 'anthropic'
        ? await requestAnthropic(config, request, fetchImpl)
        : await requestOpenAI(config, request, fetchImpl);
    } catch (error) {
      const classified = classifyThrown(error);
      lastError = classified;
      if (!classified.retryable || attempt === retries) throw classified;
      await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

async function requestOpenAI(
  config: AIConfig,
  request: AIRequest,
  fetchImpl: FetchLike,
): Promise<AIResponse> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages: request.messages.map(toOpenAIMessage),
    max_tokens: request.maxTokens ?? 4096,
    stream: true,
  };
  if (request.temperature != null) body.temperature = request.temperature;
  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
    body.tool_choice = toOpenAIToolChoice(request.toolChoice ?? 'auto');
  }

  const response = await postJson(
    endpoint(config.baseUrl, 'chat/completions'),
    {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body,
    request.timeoutMs,
    fetchImpl,
  );

  if (isEventStream(response)) {
    return parseOpenAIStream(response, request.onText ?? ignoreTextDelta);
  }
  return parseOpenAIJson(await parseJsonResponse(response));
}

function toOpenAIMessage(message: AIMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.input) },
      })),
    };
  }
  return { role: message.role, content: message.content };
}

function toOpenAIToolChoice(choice: AIRequest['toolChoice']): unknown {
  return typeof choice === 'object'
    ? { type: 'function', function: { name: choice.name } }
    : choice;
}

function parseOpenAIJson(value: unknown): AIResponse {
  const root = asRecord(value);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = asRecord(asRecord(choices[0]).message);
  const content = typeof message.content === 'string' ? message.content : '';
  const toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls.map(parseOpenAIToolCall)
    : [];
  const usage = asRecord(root.usage);
  return {
    content,
    toolCalls,
    usage: {
      inputTokens: numberOrUndefined(usage.prompt_tokens),
      outputTokens: numberOrUndefined(usage.completion_tokens),
    },
    raw: value,
  };
}

async function parseOpenAIStream(
  response: Response,
  onText: (delta: string) => void,
): Promise<AIResponse> {
  let content = '';
  const calls = new Map<number, { id: string; name: string; arguments: string }>();
  let usage: AIResponse['usage'];

  await consumeSSE(response, (value) => {
    const root = asRecord(value);
    const usageRoot = asRecord(root.usage);
    if (Object.keys(usageRoot).length) {
      usage = {
        inputTokens: numberOrUndefined(usageRoot.prompt_tokens),
        outputTokens: numberOrUndefined(usageRoot.completion_tokens),
      };
    }
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const delta = asRecord(asRecord(choices[0]).delta);
    if (typeof delta.content === 'string') {
      content += delta.content;
      onText(delta.content);
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const raw of delta.tool_calls) {
        const part = asRecord(raw);
        const index = typeof part.index === 'number' ? part.index : 0;
        const fn = asRecord(part.function);
        const existing = calls.get(index) ?? { id: '', name: '', arguments: '' };
        if (typeof part.id === 'string') existing.id = part.id;
        if (typeof fn.name === 'string') existing.name += fn.name;
        if (typeof fn.arguments === 'string') existing.arguments += fn.arguments;
        calls.set(index, existing);
      }
    }
  });

  return {
    content,
    toolCalls: [...calls.values()].map((call, index) => ({
      id: call.id || `tool_${index}`,
      name: call.name,
      input: parseToolInput(call.arguments),
    })),
    usage,
  };
}

async function requestAnthropic(
  config: AIConfig,
  request: AIRequest,
  fetchImpl: FetchLike,
): Promise<AIResponse> {
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: request.maxTokens ?? 4096,
    messages: request.messages
      .filter((message) => message.role !== 'system')
      .map(toAnthropicMessage),
    stream: true,
  };
  if (system) body.system = system;
  if (request.temperature != null) body.temperature = request.temperature;
  if (request.tools?.length) {
    body.tools = request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
    body.tool_choice = toAnthropicToolChoice(request.toolChoice ?? 'auto');
  }

  const response = await postJson(
    endpoint(config.baseUrl, 'messages'),
    {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body,
    request.timeoutMs,
    fetchImpl,
  );

  if (isEventStream(response)) {
    return parseAnthropicStream(response, request.onText ?? ignoreTextDelta);
  }
  return parseAnthropicJson(await parseJsonResponse(response));
}

function toAnthropicMessage(message: AIMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }],
    };
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: [
        ...(message.content ? [{ type: 'text', text: message.content }] : []),
        ...message.toolCalls.map((call) => ({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: call.input,
        })),
      ],
    };
  }
  return { role: message.role, content: message.content };
}

function toAnthropicToolChoice(choice: AIRequest['toolChoice']): unknown {
  if (typeof choice === 'object') return { type: 'tool', name: choice.name };
  if (choice === 'required') return { type: 'any' };
  if (choice === 'none') return { type: 'none' };
  return { type: 'auto' };
}

function parseAnthropicJson(value: unknown): AIResponse {
  const root = asRecord(value);
  const blocks = Array.isArray(root.content) ? root.content.map(asRecord) : [];
  const content = blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
  const toolCalls = blocks
    .filter((block) => block.type === 'tool_use')
    .map((block, index) => ({
      id: typeof block.id === 'string' ? block.id : `tool_${index}`,
      name: typeof block.name === 'string' ? block.name : '',
      input: block.input ?? {},
    }));
  const usage = asRecord(root.usage);
  return {
    content,
    toolCalls,
    usage: {
      inputTokens: numberOrUndefined(usage.input_tokens),
      outputTokens: numberOrUndefined(usage.output_tokens),
    },
    raw: value,
  };
}

async function parseAnthropicStream(
  response: Response,
  onText: (delta: string) => void,
): Promise<AIResponse> {
  let content = '';
  const calls = new Map<number, { id: string; name: string; arguments: string; input?: unknown }>();
  let usage: AIResponse['usage'];

  await consumeSSE(response, (value) => {
    const event = asRecord(value);
    const index = typeof event.index === 'number' ? event.index : 0;
    const block = asRecord(event.content_block);
    if (event.type === 'content_block_start' && block.type === 'tool_use') {
      calls.set(index, {
        id: typeof block.id === 'string' ? block.id : `tool_${index}`,
        name: typeof block.name === 'string' ? block.name : '',
        arguments: '',
        input: block.input,
      });
    }
    const delta = asRecord(event.delta);
    if (event.type === 'content_block_delta' && delta.type === 'text_delta') {
      const text = typeof delta.text === 'string' ? delta.text : '';
      content += text;
      onText(text);
    }
    if (event.type === 'content_block_delta' && delta.type === 'input_json_delta') {
      const existing = calls.get(index) ?? {
        id: `tool_${index}`,
        name: '',
        arguments: '',
      };
      if (typeof delta.partial_json === 'string') existing.arguments += delta.partial_json;
      calls.set(index, existing);
    }
    const message = asRecord(event.message);
    const messageUsage = asRecord(message.usage);
    const deltaUsage = asRecord(event.usage);
    const usageRoot = Object.keys(deltaUsage).length ? deltaUsage : messageUsage;
    if (Object.keys(usageRoot).length) {
      usage = {
        inputTokens: numberOrUndefined(usageRoot.input_tokens),
        outputTokens: numberOrUndefined(usageRoot.output_tokens),
      };
    }
  });

  return {
    content,
    toolCalls: [...calls.values()].map((call) => ({
      id: call.id,
      name: call.name,
      input: call.arguments ? parseToolInput(call.arguments) : (call.input ?? {}),
    })),
    usage,
  };
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs = 45_000,
  fetchImpl: FetchLike,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw fromHttpStatus(response.status, detail);
    }
    return response;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;
    if (controller.signal.aborted) {
      throw new AIProviderError('timeout', `AI 请求超过 ${Math.round(timeoutMs / 1000)} 秒`, undefined, true);
    }
    throw new AIProviderError(
      'network',
      error instanceof Error ? error.message : '无法连接 AI 服务',
      undefined,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text());
  } catch {
    throw new AIProviderError('invalid_response', 'AI 服务返回了无法解析的响应');
  }
}

function fromHttpStatus(status: number, detail: string): AIProviderError {
  const message = errorMessage(detail);
  if (status === 401 || status === 403) {
    return new AIProviderError('auth', message || 'API Key 无效或没有访问权限', status);
  }
  if (status === 429) {
    return new AIProviderError('rate_limit', message || '请求过于频繁或额度不足', status, true);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new AIProviderError('model', message || '模型名、地址或请求能力不兼容', status);
  }
  return new AIProviderError('network', message || `AI 服务错误（HTTP ${status}）`, status, status >= 500);
}

function errorMessage(detail: string): string {
  try {
    const root = asRecord(JSON.parse(detail));
    const nested = asRecord(root.error);
    if (typeof nested.message === 'string') return nested.message;
    if (typeof root.message === 'string') return root.message;
  } catch {
    // Keep the short plain-text body below.
  }
  return detail.slice(0, 240);
}

function classifyThrown(error: unknown): AIProviderError {
  if (error instanceof AIProviderError) return error;
  return new AIProviderError(
    'network',
    error instanceof Error ? error.message : '未知 AI 请求错误',
    undefined,
    true,
  );
}

function parseOpenAIToolCall(value: unknown, index: number): AIToolCall {
  const root = asRecord(value);
  const fn = asRecord(root.function);
  return {
    id: typeof root.id === 'string' ? root.id : `tool_${index}`,
    name: typeof fn.name === 'string' ? fn.name : '',
    input: parseToolInput(typeof fn.arguments === 'string' ? fn.arguments : '{}'),
  };
}

function parseToolInput(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    throw new AIProviderError('invalid_response', '模型返回了无效的工具参数 JSON');
  }
}

function endpoint(baseUrl: string, suffix: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed.endsWith(`/${suffix}`) ? trimmed : `${trimmed}/${suffix}`;
}

function isEventStream(response: Response): boolean {
  return response.headers.get('content-type')?.includes('text/event-stream') ?? false;
}

function ignoreTextDelta(): void {
  // Streaming transport is always enabled; rendering incremental text is optional.
}

async function consumeSSE(response: Response, onValue: (value: unknown) => void): Promise<void> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    consumeSSEText(await response.text(), onValue);
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      consumeSSEBlock(buffer.slice(0, boundary), onValue);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
  if (buffer.trim()) consumeSSEBlock(buffer, onValue);
}

function consumeSSEText(text: string, onValue: (value: unknown) => void): void {
  for (const block of text.replace(/\r\n/g, '\n').split('\n\n')) {
    consumeSSEBlock(block, onValue);
  }
}

function consumeSSEBlock(block: string, onValue: (value: unknown) => void): void {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  if (!data || data === '[DONE]') return;
  try {
    onValue(JSON.parse(data));
  } catch {
    throw new AIProviderError('invalid_response', 'AI 流式响应包含无效 JSON');
  }
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testAIConnection(
  config: AIConfig,
  complete: AIComplete = completeAI,
): Promise<{ supportsTools: boolean; latencyMs: number }> {
  const started = Date.now();
  const probe = {
    name: 'nexset_connection_probe',
    description: 'Call this tool once to confirm function calling support.',
    inputSchema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
  };
  try {
    const response = await complete(config, {
      messages: [{ role: 'user', content: '调用连接测试工具，参数 ok=true。' }],
      tools: [probe],
      toolChoice: 'required',
      maxTokens: 64,
      timeoutMs: 20_000,
      maxRetries: 0,
    });
    return { supportsTools: response.toolCalls.some((call) => call.name === probe.name), latencyMs: Date.now() - started };
  } catch (error) {
    if (error instanceof AIProviderError && (error.kind === 'auth' || error.kind === 'rate_limit')) {
      throw error;
    }
    await complete(config, {
      messages: [{ role: 'user', content: '只回复 OK' }],
      maxTokens: 16,
      timeoutMs: 20_000,
      maxRetries: 0,
    });
    return { supportsTools: false, latencyMs: Date.now() - started };
  }
}
