import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(packageRoot, '../..')
const miniProgramSharedRoot = path.join(repoRoot, 'apps/miniprogram/src/assets/shared')
const miniProgramInactiveColor = '#6B7280'

const ensureStrokeClassesAreHollow = (svgContent = '') => (
  svgContent.replace(
    /(\.cls-\d+(?:,\s*\.cls-\d+)*)\{([^}]*stroke:\s*#000000?[^}]*)\}/gi,
    (match, selectors, rules) => (
      /fill\s*:/i.test(rules) ? match : `${selectors}{fill:none;${rules}}`
    )
  )
)

const normalizeTabbarSvgForMask = (svgContent = '') => (
  ensureStrokeClassesAreHollow(
    svgContent
      .replace(/stroke:\s*#000000?\b/gi, 'stroke:#000')
      .replace(/fill:\s*#000000?\b/gi, 'fill:#000')
  )
)

const prepareSvgForMiniProgram = (svgContent, relativePath = '') => {
  if (relativePath.includes('tabbar/')) {
    // Tabbar 走 CSS mask + currentColor 着色，不在 SVG 里写死品牌色。
    return normalizeTabbarSvgForMask(svgContent)
  }

  if (relativePath.includes('illustrations/')) {
    return svgContent
  }

  return svgContent.replace(/currentColor/g, miniProgramInactiveColor)
}

const copySvgTree = async (sourceDir, targetDir, relativeDir = '') => {
  await mkdir(targetDir, { recursive: true })
  const entries = await readdir(sourceDir, { withFileTypes: true })

  await Promise.all(entries.map(async (entry) => {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    const relativePath = path.posix.join(relativeDir, entry.name)

    if (entry.isDirectory()) {
      await copySvgTree(sourcePath, targetPath, relativePath)
      return
    }

    if (!entry.name.endsWith('.svg')) {
      return
    }

    const svgContent = await readFile(sourcePath, 'utf8')
    await writeFile(targetPath, prepareSvgForMiniProgram(svgContent, relativePath), 'utf8')
  }))
}

const syncBrandAssets = async () => {
  const brandSource = path.join(packageRoot, 'brand')
  const brandTarget = path.join(miniProgramSharedRoot, 'brand')

  try {
    await readdir(brandSource)
  } catch {
    return
  }

  await rm(brandTarget, { recursive: true, force: true })
  await mkdir(brandTarget, { recursive: true })
  await cp(brandSource, brandTarget, { recursive: true })
}

const syncPublicLogos = async () => {
  const logoSource = path.join(packageRoot, 'brand/logo-liwu.svg')
  const targets = [
    path.join(repoRoot, 'apps/app/public/logo.svg'),
    path.join(repoRoot, 'apps/web/public/logo.svg')
  ]

  await Promise.all(targets.map((target) => cp(logoSource, target)))
}

const main = async () => {
  await rm(path.join(miniProgramSharedRoot, 'icons'), { recursive: true, force: true })
  await rm(path.join(miniProgramSharedRoot, 'illustrations'), { recursive: true, force: true })

  await copySvgTree(
    path.join(packageRoot, 'icons'),
    path.join(miniProgramSharedRoot, 'icons')
  )

  try {
    await copySvgTree(
      path.join(packageRoot, 'illustrations'),
      path.join(miniProgramSharedRoot, 'illustrations')
    )
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  await syncBrandAssets()
  await syncPublicLogos()

  console.log(`Synced shared assets to ${path.relative(repoRoot, miniProgramSharedRoot)}`)
}

main().catch((error) => {
  console.error('Failed to sync shared assets to miniprogram:', error)
  process.exitCode = 1
})