const rawConfig = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {};

const envOrEmpty = (v) => (v && String(v).trim().length > 0 ? String(v).trim() : '');
const hasEnv = (v) => Boolean(envOrEmpty(v));

const hasOpenRouterKey =
  Boolean(rawConfig.hasOpenRouterKey === true) || hasEnv(import.meta.env.VITE_OPENROUTER_API_KEY);

const openRouterModel =
  envOrEmpty(import.meta.env.VITE_OPENROUTER_MODEL) || rawConfig.openRouterModel || 'openai/gpt-3.5-turbo-instruct';

// Provider routing optimization: 'latency' (fastest response), 'throughput' (highest tokens/sec), or 'price' (cheapest)
const openRouterProviderSort =
  envOrEmpty(import.meta.env.VITE_OPENROUTER_PROVIDER_SORT) || rawConfig.openRouterProviderSort || 'latency';

export const appConfig = {
  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN,
  openRouter: {
    hasApiKey: hasOpenRouterKey,
    model: openRouterModel,
    baseUrl: envOrEmpty(import.meta.env.VITE_OPENROUTER_BASE_URL) || 'https://openrouter.ai/api/v1',
    title: envOrEmpty(import.meta.env.VITE_OPENROUTER_APP_TITLE) || 'Digital ATC',
    providerSort: openRouterProviderSort,
  },
};

export function assertStartupConfig() {
  if (!rawConfig.hasMapboxToken) {
    console.warn(
      '[digital-atc] Missing Mapbox token (VITE_MAPBOX_TOKEN). Terrain map will not load.'
    );
  }

  if (!rawConfig.hasOpenRouterKey) {
    console.warn(
      '[digital-atc] Missing OpenRouter API key (VITE_OPENROUTER_API_KEY). LLM-powered pilot will run in mock/offline mode.'
    );
  }
}