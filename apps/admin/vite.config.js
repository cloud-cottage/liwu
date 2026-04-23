import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
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
