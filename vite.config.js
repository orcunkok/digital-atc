import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const appConfig = {
    hasMapboxToken: Boolean(env.VITE_MAPBOX_TOKEN),
    hasOpenRouterKey: Boolean(env.VITE_OPENROUTER_API_KEY),
    openRouterModel: env.VITE_OPENROUTER_MODEL || 'openrouter/auto',
  };

  return {
    plugins: [vue()],
    define: {
      __APP_CONFIG__: JSON.stringify(appConfig),
    },
  };
});
