import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const miniProgramSrcRoot = path.join(repoRoot, 'apps/miniprogram/src')
const miniProgramSharedRoot = path.join(miniProgramSrcRoot, 'assets/shared')
const miniProgramUtilsSharedRoot = path.join(miniProgramSrcRoot, 'utils/shared')
const assetPathsSource = path.join(repoRoot, 'packages/shared-assets/src/miniprogram-paths.js')
const assetPathsTarget = path.join(miniProgramUtilsSharedRoot, 'asset-paths.js')

const requiredSyncedUtils = [
  'asset-paths.js',
  'database-config.js',
  'auth.js',
  'badge-system.js',
  'theme-system.js',
  'home-carousel-settings.js',
  'page-masthead-settings.js',
  'shop-home-living-settings.js',
  'meditation-reward-settings.js',
  'cloudbase-document-helpers.js',
  'cloudbase-user-identity.js',
  'cloudbase-wealth-snapshot.js',
  'users-split-fields.js',
  'cloudbase-user-profile.js',
  'user-bundle.js'
]

const collectWxmlFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectWxmlFiles(entryPath)
    }
    return entry.name.endsWith('.wxml') ? [entryPath] : []
  }))

  return files.flat()
}

const assertPathExists = async (targetPath, label) => {
  try {
    await access(targetPath)
  } catch {
    throw new Error(`Missing ${label}: ${path.relative(repoRoot, targetPath)}`)
  }
}

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

const assertAssetPathsSynced = async () => {
  const [source, target] = await Promise.all([
    readFile(assetPathsSource, 'utf8'),
    readFile(assetPathsTarget, 'utf8')
  ])

  const normalize = (value) => value.replace(/\r\n/g, '\n').trim()
  if (normalize(convertStandaloneEsmToCjs(source)) !== normalize(target)) {
    throw new Error('asset-paths.js is out of sync. Run `npm run miniprogram:sync`.')
  }
}

const assertNoHardcodedSharedAssetPaths = async () => {
  const wxmlFiles = await collectWxmlFiles(miniProgramSrcRoot)
  const violations = []

  await Promise.all(wxmlFiles.map(async (filePath) => {
    const content = await readFile(filePath, 'utf8')
    const matches = content.match(/\/assets\/shared\/[A-Za-z0-9_./-]+/g) || []
    matches.forEach((match) => {
      violations.push(`${path.relative(repoRoot, filePath)} -> ${match}`)
    })
  }))

  if (violations.length > 0) {
    throw new Error(
      `Hardcoded shared asset paths found in WXML. Use resolveMiniProgramIconPath() in page data instead:\n${violations.join('\n')}`
    )
  }
}

const assertRegistryAssetsExist = async () => {
  const {
    brandAssetKeys,
    commerceIconKeys,
    illustrationAssetKeys,
    profileIconKeys,
    tabbarActiveIconKeys,
    tabbarIconKeys
  } = await import(pathToFileURL(assetPathsSource).href)

  const iconRelativePaths = [
    ...Object.values(tabbarIconKeys),
    ...Object.values(tabbarActiveIconKeys),
    ...Object.values(commerceIconKeys),
    ...Object.values(profileIconKeys)
  ]

  const illustrationRelativePaths = Object.values(illustrationAssetKeys)
  const brandRelativePaths = Object.values(brandAssetKeys)

  const missing = []

  iconRelativePaths.forEach((relativePath) => {
    const targetPath = path.join(miniProgramSharedRoot, 'icons', relativePath)
    missing.push({ label: `icon ${relativePath}`, targetPath })
  })

  illustrationRelativePaths.forEach((relativePath) => {
    const targetPath = path.join(miniProgramSharedRoot, relativePath)
    missing.push({ label: `illustration ${relativePath}`, targetPath })
  })

  brandRelativePaths.forEach((relativePath) => {
    const targetPath = path.join(miniProgramSharedRoot, 'brand', relativePath)
    missing.push({ label: `brand ${relativePath}`, targetPath })
  })

  await Promise.all(missing.map(async ({ label, targetPath }) => {
    try {
      await access(targetPath)
    } catch {
      throw new Error(`Missing synced ${label}: ${path.relative(repoRoot, targetPath)}`)
    }
  }))
}

const main = async () => {
  await assertPathExists(miniProgramSharedRoot, 'miniprogram shared assets directory')
  await assertPathExists(assetPathsTarget, 'synced asset-paths helper')

  await Promise.all(requiredSyncedUtils.map((fileName) => (
    assertPathExists(path.join(miniProgramUtilsSharedRoot, fileName), `synced util ${fileName}`)
  )))

  await assertAssetPathsSynced()
  await assertNoHardcodedSharedAssetPaths()
  await assertRegistryAssetsExist()

  console.log('Miniprogram build checks passed.')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})