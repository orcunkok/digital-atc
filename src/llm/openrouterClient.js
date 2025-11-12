import { appConfig } from '../utils/config';

const OPENROUTER_CHAT_URL = () =>
  `${appConfig.openRouter?.baseUrl || 'https://openrouter.ai/api/v1'}/chat/completions`;

export class OpenRouterClientError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'OpenRouterClientError';
    this.code = options.code || 'openrouter_error';
    this.status = options.status;
    this.details = options.details;
  }
}

export async function callOpenRouter({
  messages,
  responseFormat = { type: 'json_object' },
  temperature = 0,
}) {
  if (!appConfig.openRouter?.hasApiKey) {
    throw new OpenRouterClientError(
      'Missing OpenRouter API key. Set VITE_OPENROUTER_API_KEY in .env to enable the digital pilot.',
      { code: 'missing_api_key' }
    );
  }

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new OpenRouterClientError(
      'VITE_OPENROUTER_API_KEY is not available at runtime. Restart dev server after setting the key.',
      { code: 'api_key_not_loaded' }
    );
  }

  const payload = {
    model: appConfig.openRouter?.model || 'openrouter/auto',
    messages,
    temperature,
    max_tokens: 600,
    response_format: responseFormat,
  };

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (appConfig.openRouter?.title) {
    headers['X-Title'] = appConfig.openRouter.title;
  }

  const response = await fetch(OPENROUTER_CHAT_URL(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetails = null;
    try {
      errorDetails = await response.json();
    } catch (_) {}
    throw new OpenRouterClientError('OpenRouter request failed.', {
      code: 'http_error',
      status: response.status,
      details: errorDetails,
    });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new OpenRouterClientError('OpenRouter returned an empty response.', {
      code: 'empty_response',
    });
  }

  return {
    content: content.trim(),
    usage: data?.usage || null,
    raw: data,
  };
}


