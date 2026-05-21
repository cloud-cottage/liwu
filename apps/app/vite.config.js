import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  resolve: {
    alias: {
      '@liwu/auth': fileURLToPath(new URL('../../packages/auth/index.js', import.meta.url))
    }
  },
  server: {
    port: 5176,
    proxy: {
      '/api/cloudbase-proxy': {
        target: 'https://liwu.yunduojihua.com',
        changeOrigin: true,
        secure: true
      }
    }
  }
})