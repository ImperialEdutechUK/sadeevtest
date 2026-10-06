import type { Config } from '../../config.js';
import { logger } from '../../logger.js';
import type { LlmMessage, LlmProvider, LlmResult } from './index.js';

/**
 * OpenRouter - OpenAI-compatible chat completions over any model.
 * https://openrouter.ai/docs
 */
export class OpenRouterProvider implements LlmProvider {
  readonly name = 'openrouter' as const;
  constructor(private cfg: Config) {}

  defaultModel(): string {
    return this.cfg.OPENROUTER_MODEL;
  }

  async complete(messages: LlmMessage[], opts: { maxTokens?: number; temperature?: number; purpose?: string } = {}): Promise<LlmResult> {
    const models = [this.cfg.OPENROUTER_MODEL, this.cfg.OPENROUTER_FALLBACK_MODEL].filter(Boolean);
    let lastError: unknown = null;
    for (const model of models) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          return await this.request(model, messages, opts);
        } catch (err) {
          lastError = err;
          const status = (err as { status?: number }).status;
          const retryable = status === undefined || status === 408 || status === 429 || (status >= 500 && status < 600);
          logger.warn({ err: String(err), model, attempt, status }, 'OpenRouter request failed');
          if (!retryable) break;
          await new Promise((r) => setTimeout(r, 1500 * 2 ** (attempt - 1)));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async request(model: string, messages: LlmMessage[], opts: { maxTokens?: number; temperature?: number; purpose?: string }): Promise<LlmResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.LLM_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.cfg.OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.cfg.WEB_ORIGIN,
          'X-Title': 'Meeting Review (South London College)',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 6000,
          // Ask providers that support it for strict JSON; others ignore this field.
          response_format: { type: 'json_object' },
          provider: { require_parameters: false },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`OpenRouter ${res.status}: ${body.slice(0, 400)}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string | { text?: string }[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
        error?: { message?: string };
      };
      if (json.error) throw new Error(`OpenRouter error: ${json.error.message}`);
      const raw = json.choices?.[0]?.message?.content;
      const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => p.text ?? '').join('') : '';
      if (!text.trim()) throw new Error('OpenRouter returned an empty response');
      return {
        text,
        model: json.model ?? model,
        usage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens ?? 0,
              completionTokens: json.usage.completion_tokens ?? 0,
              totalTokens: json.usage.total_tokens ?? 0,
            }
          : null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
