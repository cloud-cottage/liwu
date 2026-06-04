import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleTencentTtsProxy } from './src/admin/server/tencentTtsProxy.js'
import { handleLocalClientBuildRequest } from './src/admin/server/localClientBuildServer.js'
import handleCloudBaseProxy from '../app/api/cloudbase-proxy.js'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const loadMergedEnv = (mode, envDirs) => (
  envDirs.reduce(
    (accumulator, envDir) => ({ ...accumulator, ...loadEnv(mode, envDir, '') }),
    {}
  )
)

const attachApiResponseHelpers = (res) => {
  if (typeof res.status !== 'function') {
    res.status = (statusCode) => {
      res.statusCode = statusCode
      return res
    }
  }

  if (typeof res.json !== 'function') {
    res.json = (payload) => {
      if (!res.headersSent) {
        res.setHeader('content-type', 'application/json; charset=utf-8')
      }
      res.end(JSON.stringify(payload))
      return res
    }
  }

  if (typeof res.send !== 'function') {
    res.send = (payload) => {
      if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
        res.end(payload)
        return res
      }

      if (typeof payload === 'object' && payload !== null) {
        if (!res.headersSent) {
          res.setHeader('content-type', 'application/json; charset=utf-8')
        }
        res.end(JSON.stringify(payload))
        return res
      }

      res.end(String(payload ?? ''))
      return res
    }
  }

  return res
}

const localWebAdminProxyPlugin = (env) => ({
  name: 'local-web-admin-proxy',
  configureServer(server) {
    server.middlewares.use('/api/cloudbase-proxy', async (req, res, next) => {
      const startedAt = Date.now()
      const requestUrl = typeof req.url === 'string' ? new URL(`http://localhost${req.url}`) : null
      const target = requestUrl?.searchParams.get('target') || ''
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

      try {
        req.query = Object.fromEntries(requestUrl?.searchParams.entries() || [])
        await handleCloudBaseProxy(req, attachApiResponseHelpers(res))
      } catch (error) {
        next(error)
      }
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
