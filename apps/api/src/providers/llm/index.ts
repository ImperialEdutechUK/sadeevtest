import { loadConfig } from '../../config.js';
import { OpenRouterProvider } from './openrouter.js';
import { MockLlmProvider } from './mock.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface LlmResult {
  text: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null;
}
export interface LlmProvider {
  readonly name: 'openrouter' | 'mock';
  /** Return a chat completion. Implementations must throw on hard failures. */
  complete(messages: LlmMessage[], opts?: { maxTokens?: number; temperature?: number; purpose?: string; model?: string }): Promise<LlmResult>;
  defaultModel(): string;
}

let instance: LlmProvider | null = null;
export function getLlmProvider(): LlmProvider {
  if (instance) return instance;
  const cfg = loadConfig();
  instance = cfg.LLM_PROVIDER === 'openrouter' ? new OpenRouterProvider(cfg) : new MockLlmProvider();
  return instance;
}

/** Find the first JSON object in a model reply (tolerates code fences and preambles). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in the model response');
  return JSON.parse(candidate.slice(start, end + 1));
}
