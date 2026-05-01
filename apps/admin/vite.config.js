import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleTencentTtsProxy } from './src/server/tencentTtsProxy.js'
import { handleLocalClientBuildRequest } from './src/server/localClientBuildServer.js'

const localTtsProxyPlugin = (env) => ({
  name: 'local-tts-proxy',
  configureServer(server) {
    server.middlewares.use('/api/tts-proxy', async (req, res, next) => {
      try {
        await handleTencentTtsProxy(req, res, env)
      } catch (error) {
        next(error)
      }
    })

    server.middlewares.use('/api/local-client-build', async (req, res, next) => {
      try {
        await handleLocalClientBuildRequest(req, res)
      } catch (error) {
        next(error)
      }
    })
  }
})

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), localTtsProxyPlugin(env)],
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
  }
})
