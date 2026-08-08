import {
  COLLECTIONS,
  DATABASE_OPTIONS,
  DEFAULT_CLOUDBASE_ENV,
  DEFAULT_CLOUDBASE_REGION,
  DEFAULT_CLOUDBASE_WECHAT_PROVIDER_ID
} from './database-config.js'

const readEnv = (env = {}, ...names) => {
  const processEnv = typeof globalThis !== 'undefined' ? globalThis.process?.env : undefined

  for (const name of names) {
    const viteValue = env?.[name]
    if (typeof viteValue === 'string' && viteValue.trim()) {
      return viteValue.trim()
    }

    const processValue = processEnv?.[name]
    if (typeof processValue === 'string' && processValue.trim()) {
      return processValue.trim()
    }
  }

  return undefined
}

export const createClientDatabaseConfig = ({
  env = {},
  isDevelopment
} = {}) => {
  const resolvedIsDevelopment = (
    isDevelopment ?? env?.DEV ?? readEnv(env, 'NODE_ENV') === 'development'
  )
  const databaseConfig = {
    cloudbase: {
      env: readEnv(env, 'VITE_CLOUDBASE_ENV', 'REACT_APP_CLOUDBASE_ENV') || DEFAULT_CLOUDBASE_ENV,
      region: readEnv(env, 'VITE_CLOUDBASE_REGION', 'REACT_APP_CLOUDBASE_REGION') || DEFAULT_CLOUDBASE_REGION,
      publishableKey: readEnv(env, 'VITE_CLOUDBASE_PUBLISHABLE_KEY', 'REACT_APP_CLOUDBASE_PUBLISHABLE_KEY'),
      wechatProviderId: readEnv(env, 'VITE_CLOUDBASE_WECHAT_PROVIDER_ID', 'REACT_APP_CLOUDBASE_WECHAT_PROVIDER_ID') || DEFAULT_CLOUDBASE_WECHAT_PROVIDER_ID
    },
    collections: COLLECTIONS,
    options: DATABASE_OPTIONS
  }

  return {
    DATABASE_CONFIG: databaseConfig,
    DEV_CONFIG: {
      useLocalStorage: resolvedIsDevelopment && !databaseConfig.cloudbase.publishableKey,
      mockData: true
    }
  }
}