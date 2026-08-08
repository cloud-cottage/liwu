const addCurrentColorFill = (svgMarkup = '') => (
  svgMarkup.replace(
    /<(path|circle|rect)\b((?![^>]*\bfill=)[^>])*>/gi,
    (tag) => (
      /\bclass="/i.test(tag)
        ? tag
        : tag.replace(/^(<(?:path|circle|rect)\b)/i, '$1 fill="currentColor"')
    )
  )
)

const BLACK_COLOR_PATTERN = '#(?:000000|0000|000)\\b'

export const normalizeTintableSvg = (svgMarkup = '') => (
  addCurrentColorFill(
    svgMarkup
      .replace(new RegExp(`stroke:\\s*${BLACK_COLOR_PATTERN}`, 'gi'), 'stroke:currentColor')
      .replace(new RegExp(`fill:\\s*${BLACK_COLOR_PATTERN}`, 'gi'), 'fill:currentColor')
      .replace(/stroke="#(?:000000|0000|000)"/gi, 'stroke="currentColor"')
      .replace(/fill="#(?:000000|0000|000)"/gi, 'fill="currentColor"')
      // 仅对未声明 fill 的描边类补 fill:none，保留激活态刻意实心区域。
      .replace(
        new RegExp(`(\\.cls-\\d+(?:,\\s*\\.cls-\\d+)*)\\{([^}]*stroke:\\s*${BLACK_COLOR_PATTERN}[^}]*)\\}`, 'gi'),
        (match, selectors, rules) => (
          /fill\s*:/i.test(rules) ? match : `${selectors}{fill:none;${rules}}`
        )
      )
  )
)