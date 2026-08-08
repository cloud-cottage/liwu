import React, { useMemo } from 'react'
import { sharedIconSources } from './iconSources.js'

const injectSvgSize = (svgMarkup, size) => (
  svgMarkup.replace(/<svg([^>]*)>/, (_match, attrs) => {
    const cleanedAttrs = attrs.replace(/\s(width|height)="[^"]*"/g, '')
    return `<svg${cleanedAttrs} width="${size}" height="${size}">`
  })
)

const SharedIcon = ({
  name,
  size = 20,
  className = '',
  style = {},
  title,
  ...rest
}) => {
  const svgMarkup = useMemo(() => {
    const source = sharedIconSources[name]
    if (!source) {
      return null
    }

    return injectSvgSize(source, size)
  }, [name, size])

  if (!svgMarkup) {
    return null
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        ...style
      }}
      role={title ? 'img' : 'presentation'}
      aria-label={title || rest['aria-label']}
      aria-hidden={title || rest['aria-label'] ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
      {...rest}
    />
  )
}

export default SharedIcon