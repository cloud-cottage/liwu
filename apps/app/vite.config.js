import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  server: {
    proxy: {
      '/api/cloudbase-proxy': {
        target: 'https://liwu.yunduojihua.com',
        changeOrigin: true,
        secure: true
      }
    }
  }
})
