import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  console.log('[vite-config] loaded, mode =', mode, ', has __DEV_PROXY__ define =', true);
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@app': path.resolve(__dirname, '../app/src'),
        '@liwu/shared-assets-package': path.resolve(__dirname, '../../packages/shared-assets'),
      },
    },
    define: {
      __DEV_SKIP_CLOUDBASE_PROXY__: 'true',
      __DEV_PROXY__: 'true',
    },
    server: {
      host: '0.0.0.0',
      port: 5175,
      strictPort: true,
      proxy: {
        '/api/ai/proxy': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ai\/proxy/, ''),
        },
        '/api/tts-proxy': {
          target: 'https://liwu.nvshen.love',
          changeOrigin: true,
          secure: true,
        },
        '/api/cloudbase-proxy': {
          target: 'http://localhost:3020',
          changeOrigin: true,
        },
      },
    },
  };
});
