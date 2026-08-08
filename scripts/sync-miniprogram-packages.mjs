import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetRoot = path.join(repoRoot, 'apps/miniprogram/src/utils/shared')
const legacyRoots = [
  path.join(repoRoot, 'apps/miniprogram/src/shared-packages'),
  path.join(repoRoot, 'apps/miniprogram/src/_packages')
]

const esmSources = [
  {
    source: path.join(repoRoot, 'packages/shared-utils/page-masthead-settings.js'),
    outfile: path.join(targetRoot, 'page-masthead-settings.js')
  },
  {
    source: path.join(repoRoot, 'packages/shared-utils/home-carousel-settings.js'),
    outfile: path.join(targetRoot, 'home-carousel-settings.js')
  },
  {
    source: path.join(repoRoot, 'packages/shared-utils/theme-system.js'),
    outfile: path.join(targetRoot, 'theme-system.js')
  },
  {
    source: path.join(repoRoot, 'packages/shared-utils/badge-system.js'),
    outfile: path.join(targetRoot, 'badge-system.js')
  },
  {
    source: path.join(repoRoot, 'packages/shared-utils/database-config.js'),
    outfile: path.join(targetRoot, 'database-config.js')
  },
  {
    source: path.join(repoRoot, 'packages/shared-assets/src/miniprogram-paths.js'),
    outfile: path.join(targetRoot, 'asset-paths.js')
  },
  {
    source: path.join(repoRoot, 'packages/shared-utils/shop-home-living-settings.js'),
    outfile: path.join(targetRoot, 'shop-home-living-settings.js')
  },
  {
    source: path.join(repoRoot, 'packages/shared-utils/meditation-reward-settings.js'),
    outfile: path.join(targetRoot, 'meditation-reward-settings.js')
  }
]

const convertStandaloneEsmToCjs = (source) => {
  const exportedNames = []
  const converted = source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const constMatch = line.match(/^export const (\w+)/)
      if (constMatch) {
        exportedNames.push(constMatch[1])
        return line.replace(/^export const/, 'const')
      }

      const functionMatch = line.match(/^export function (\w+)/)
      if (functionMatch) {
        exportedNames.push(functionMatch[1])
        return line.replace(/^export function/, 'function')
      }

      return line
    })
    .join('\n')

  return `${converted}\n\nmodule.exports = {\n  ${exportedNames.join(',\n  ')}\n}\n`
}

const main = async () => {
  await Promise.all(legacyRoots.map((legacyRoot) => rm(legacyRoot, { recursive: true, force: true })))
  await rm(targetRoot, { recursive: true, force: true })
  await mkdir(targetRoot, { recursive: true })

  await copyFile(
    path.join(repoRoot, 'packages/auth/src/miniprogram-adapter.js'),
    path.join(targetRoot, 'auth.js')
  )

  for (const { source, outfile } of esmSources) {
    const content = await readFile(source, 'utf8')
    await writeFile(outfile, convertStandaloneEsmToCjs(content), 'utf8')
  }

  console.log(`Synced shared packages to ${path.relative(repoRoot, targetRoot)}`)
}

main().catch((error) => {
  console.error('Failed to sync shared packages to miniprogram:', error)
  process.exitCode = 1
})