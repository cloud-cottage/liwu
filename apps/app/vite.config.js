import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { PRIMARY_PRODUCTION_ORIGIN } from '../../packages/shared-utils/client-hosts.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  resolve: {
    alias: {
      '@liwu/auth': fileURLToPath(new URL('../../packages/auth/index.js', import.meta.url)),
      '@liwu/shared-assets': fileURLToPath(new URL('../../packages/shared-assets/src', import.meta.url)),
      '@liwu/shared-assets-package': fileURLToPath(new URL('../../packages/shared-assets', import.meta.url))
    }
  },
  server: {
    port: 5176,
    proxy: {
      '/api/cloudbase-proxy': {
        target: PRIMARY_PRODUCTION_ORIGIN,
        changeOrigin: true,
        secure: true
      }
    }
  }
})