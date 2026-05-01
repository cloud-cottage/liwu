import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')
const appRoot = path.resolve(repoRoot, 'apps/app')
const androidRoot = path.resolve(appRoot, 'android')
const apkSourcePath = path.resolve(androidRoot, 'app/build/outputs/apk/debug/app-debug.apk')
const adminPublicBuildDir = path.resolve(repoRoot, 'apps/admin/public/client-builds')
const apkTargetPath = path.resolve(adminPublicBuildDir, 'liwu-app-debug.apk')
const localJavaHome = '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home'
const localAndroidSdkRoot = '/opt/homebrew/share/android-commandlinetools'
const localPath = [
  '/opt/homebrew/opt/openjdk/bin',
  '/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin',
  '/opt/homebrew/share/android-commandlinetools/platform-tools',
  '/opt/homebrew/bin',
  '/usr/bin',
  '/bin'
].join(':')

const state = {
  building: false,
  lastBuiltAt: '',
  lastError: '',
  lastLog: '',
  apkUrl: '/client-builds/liwu-app-debug.apk'
}

const writeJson = (res, statusCode, payload) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const readRequestBody = async (req) => {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const ensureApkCopied = () => {
  if (!existsSync(apkSourcePath)) {
    return false
  }

  mkdirSync(adminPublicBuildDir, { recursive: true })
  copyFileSync(apkSourcePath, apkTargetPath)
  return true
}

const appendLog = (text = '') => {
  if (!text) {
    return
  }

  const nextLog = `${state.lastLog}${text}`
  state.lastLog = nextLog.slice(-12000)
}

const triggerAndroidBuild = () => {
  if (state.building) {
    return false
  }

  state.building = true
  state.lastError = ''
  state.lastLog = ''

  const child = spawn('gradle', ['assembleDebug'], {
    cwd: androidRoot,
    env: {
      ...process.env,
      JAVA_HOME: localJavaHome,
      ANDROID_SDK_ROOT: localAndroidSdkRoot,
      ANDROID_HOME: localAndroidSdkRoot,
      PATH: localPath
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.on('data', (chunk) => appendLog(String(chunk)))
  child.stderr.on('data', (chunk) => appendLog(String(chunk)))

  child.on('close', (code) => {
    state.building = false

    if (code === 0) {
      ensureApkCopied()
      state.lastBuiltAt = new Date().toISOString()
      state.lastError = ''
      return
    }

    state.lastError = `Android APK 构建失败，退出码 ${code}`
  })

  child.on('error', (error) => {
    state.building = false
    state.lastError = error.message || 'Android APK 构建失败'
  })

  return true
}

export const handleLocalClientBuildRequest = async (req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost')
  const method = req.method || 'GET'

  if (requestUrl.pathname === '/api/local-client-build/status' && method === 'GET') {
    ensureApkCopied()
    writeJson(res, 200, {
      success: true,
      data: {
        ...state,
        apkExists: existsSync(apkTargetPath)
      }
    })
    return
  }

  if (requestUrl.pathname === '/api/local-client-build/android' && method === 'POST') {
    await readRequestBody(req)

    const started = triggerAndroidBuild()
    if (!started) {
      writeJson(res, 409, {
        success: false,
        message: '当前已有 Android APK 构建任务在进行中。'
      })
      return
    }

    writeJson(res, 202, {
      success: true,
      message: '已开始重打 Android APK。'
    })
    return
  }

  writeJson(res, 404, {
    success: false,
    message: 'Not found'
  })
}
