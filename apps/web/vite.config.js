import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleTencentTtsProxy } from './src/admin/server/tencentTtsProxy.js'
import { handleLocalClientBuildRequest } from './src/admin/server/localClientBuildServer.js'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const loadMergedEnv = (mode, envDirs) => (
  envDirs.reduce(
    (accumulator, envDir) => ({ ...accumulator, ...loadEnv(mode, envDir, '') }),
    {}
  )
)

const localWebAdminProxyPlugin = (env) => ({
  name: 'local-web-admin-proxy',
  configureServer(server) {
    server.middlewares.use('/api/cloudbase-proxy', (req, res, next) => {
      const startedAt = Date.now()
      const target = typeof req.url === 'string'
        ? new URL(`http://localhost${req.url}`).searchParams.get('target') || ''
        : ''
      console.log(JSON.stringify({
        scope: 'vite-cloudbase-proxy',
        stage: 'request_started',
        method: req.method,
        target
      }))

      res.on('finish', () => {
        console.log(JSON.stringify({
          scope: 'vite-cloudbase-proxy',
          stage: 'response_finished',
          method: req.method,
          target,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt
        }))
      })

      next()
    })

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
  const env = loadMergedEnv(mode, [repoRoot, webRoot])

  return {
    plugins: [react(), localWebAdminProxyPlugin(env)],
    envDir: webRoot,
    envPrefix: ['VITE_', 'REACT_APP_'],
    resolve: {
      alias: {
        '@app': fileURLToPath(new URL('../app/src', import.meta.url)),
        '@liwu/auth': fileURLToPath(new URL('../../packages/auth/index.js', import.meta.url))
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
