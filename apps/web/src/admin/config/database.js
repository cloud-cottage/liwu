import { createClientDatabaseConfig } from '@liwu/shared-utils/client-database-env.js'

const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined
const { DATABASE_CONFIG, DEV_CONFIG } = createClientDatabaseConfig({ env: viteEnv })

export { DATABASE_CONFIG, DEV_CONFIG }
export default DATABASE_CONFIG