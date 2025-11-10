import { appConfig } from '../utils/config';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

export class OpenAiClientError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'OpenAiClientError';
    this.code = options.code || 'openai_error';
    this.status = options.status;
    this.details = options.details;
  }
}

export async function callOpenAi({ messages, responseFormat = { type: 'json_object' }, temperature = 0 }) {
  if (!appConfig.openAi.hasApiKey) {
    throw new OpenAiClientError(
      'Missing OpenAI API key. Set VITE_OPENAI_API_KEY in .env to enable the digital pilot.',
      { code: 'missing_api_key' }
    );
  }

  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAiClientError(
      'VITE_OPENAI_API_KEY is not available at runtime. Restart dev server after setting the key.',
      { code: 'api_key_not_loaded' }
    );
  }

  const payload = {
    model: appConfig.openAi.model,
    messages,
    temperature,
    max_tokens: 1200,
    response_format: responseFormat,
  };

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorDetails = null;
    try {
      errorDetails = await response.json();
    } catch (error) {
      // ignore parse error
    }
    throw new OpenAiClientError('OpenAI request failed.', {
      code: 'http_error',
      status: response.status,
      details: errorDetails,
    });
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    throw new OpenAiClientError('OpenAI returned an empty response.', { code: 'empty_response' });
  }

  return {
    content: content.trim(),
    usage: data?.usage || null,
    raw: data,
  };
}

