import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const rootDir = process.cwd()
const rootDistDir = join(rootDir, 'dist')
const webDistDir = join(rootDir, 'apps', 'web', 'dist')
const adminDistDir = join(rootDir, 'apps', 'admin', 'dist')

const copyDirectoryContents = (fromDir, toDir) => {
  if (!existsSync(fromDir)) {
    throw new Error(`Missing build output: ${fromDir}`)
  }

  mkdirSync(toDir, { recursive: true })

  for (const entry of readdirSync(fromDir)) {
    cpSync(join(fromDir, entry), join(toDir, entry), {
      recursive: true,
      force: true
    })
  }
}

rmSync(rootDistDir, { recursive: true, force: true })

execSync('npm run build:web', { stdio: 'inherit' })
execSync('npm run build:admin', { stdio: 'inherit' })

copyDirectoryContents(webDistDir, rootDistDir)
copyDirectoryContents(adminDistDir, join(rootDistDir, 'admin'))
