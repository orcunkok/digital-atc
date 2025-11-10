import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const appConfig = {
    hasMapboxToken: Boolean(env.VITE_MAPBOX_TOKEN),
    hasOpenAiKey: Boolean(env.VITE_OPENAI_API_KEY),
    openAiModel: env.VITE_OPENAI_MODEL || 'gpt-4o-mini',
  };

  return {
    plugins: [vue()],
    define: {
      __APP_CONFIG__: JSON.stringify(appConfig),
    },
  };
});
