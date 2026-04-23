import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('../app/src', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api/cloudbase-proxy': {
        target: 'https://liwu.yunduojihua.com',
        changeOrigin: true,
        secure: true
      }
    },
    fs: {
      allow: ['..']
    }
  }
})
