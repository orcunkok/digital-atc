const rawConfig = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {};

const openAiModel =
  import.meta.env.VITE_OPENAI_MODEL && import.meta.env.VITE_OPENAI_MODEL.trim().length > 0
    ? import.meta.env.VITE_OPENAI_MODEL.trim()
    : rawConfig.openAiModel || 'gpt-4o-mini';

export const appConfig = {
  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN,
  openAi: {
    hasApiKey: Boolean(rawConfig.hasOpenAiKey && rawConfig.hasOpenAiKey === true),
    model: openAiModel,
  },
};

export function assertStartupConfig() {
  if (!rawConfig.hasMapboxToken) {
    console.warn(
      '[digital-atc] Missing Mapbox token (VITE_MAPBOX_TOKEN). Terrain map will not load.'
    );
  }

  if (!rawConfig.hasOpenAiKey) {
    console.warn(
      '[digital-atc] Missing OpenAI API key (VITE_OPENAI_API_KEY). LLM-powered pilot will run in mock/offline mode.'
    );
  }
}

