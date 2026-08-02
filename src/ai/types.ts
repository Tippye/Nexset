export type AIProtocol = 'openai' | 'anthropic';

export type AIConfig = {
  protocol: AIProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  supportsTools: boolean | null;
  /** Optional prices used only for local cost estimation. */
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
};

export type AIToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type AIMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: AIToolCall[];
  toolCallId?: string;
};

export type AIToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AIToolChoice = 'auto' | 'required' | 'none' | { name: string };

export type AIRequest = {
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  toolChoice?: AIToolChoice;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  onText?: (delta: string) => void;
};

export type AIUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type AIResponse = {
  content: string;
  toolCalls: AIToolCall[];
  usage?: AIUsage;
  raw?: unknown;
};

export type AIComplete = (config: AIConfig, request: AIRequest) => Promise<AIResponse>;

export type AIErrorKind =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'model'
  | 'invalid_response';

export class AIProviderError extends Error {
  constructor(
    public readonly kind: AIErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
