import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleTencentTtsProxy } from './src/admin/server/tencentTtsProxy.js'
import { handleLocalClientBuildRequest } from './src/admin/server/localClientBuildServer.js'

const localWebAdminProxyPlugin = (env) => ({
  name: 'local-web-admin-proxy',
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
    plugins: [react(), localWebAdminProxyPlugin(env)],
    envPrefix: ['VITE_', 'REACT_APP_'],
    resolve: {
      alias: {
        '@app': fileURLToPath(new URL('../app/src', import.meta.url))
      }
    },
    server: {
      port: 5175,
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
  }
})
