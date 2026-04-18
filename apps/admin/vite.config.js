import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  envPrefix: ['VITE_', 'REACT_APP_'],
})
