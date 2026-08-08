export const createCloudBaseSdk = (cloudbase, { env, region, publishableKey } = {}) => {
  const app = cloudbase.init({
    env,
    ...(region ? { region } : {}),
    ...(publishableKey ? { publishableKey } : {})
  })

  const db = app.database()
  const auth = app.auth({ persistence: 'local' })

  return {
    app,
    db,
    auth,
    command: db.command
  }
}