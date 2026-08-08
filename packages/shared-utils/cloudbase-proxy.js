export const CLOUDBASE_PROXY_PATH = '/api/cloudbase-proxy'
export const CLOUDBASE_PROXY_TRACE_KEY = '__liwuCloudBaseProxyTrace'

export const isCloudBaseApiUrl = (value = '') => {
  try {
    const nextUrl = new URL(String(value))
    return (
      nextUrl.hostname.endsWith('.tcb-api.tencentcloudapi.com') ||
      nextUrl.hostname.endsWith('.myqcloud.com') ||
      nextUrl.hostname.endsWith('.qcloud.la') ||
      nextUrl.hostname.endsWith('.tcb.qcloud.la') ||
      nextUrl.hostname.includes('liwu-d8gek6jjdab1d087c') ||
      nextUrl.hostname.includes('-liwu-d8gek6jjdab1d087c.')
    )
  } catch {
    return false
  }
}

const shouldUseCloudBaseProxy = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.protocol === 'http:' || window.location.protocol === 'https:'
}

const buildProxyRequestId = () => `cbreq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

const rememberProxyTrace = (trace = {}) => {
  if (typeof window === 'undefined') {
    return
  }

  window[CLOUDBASE_PROXY_TRACE_KEY] = {
    ...trace,
    recordedAt: Date.now()
  }
}

export const createCloudBaseProxyRuntime = ({
  proxyPath = CLOUDBASE_PROXY_PATH,
  resolveProxyBase = () => '',
  enableTrace = false
} = {}) => {
  const toProxyUrl = (targetUrl, requestId = '') => {
    const requestIdSuffix = enableTrace && requestId
      ? `&requestId=${encodeURIComponent(requestId)}`
      : ''

    return `${resolveProxyBase()}${proxyPath}?target=${encodeURIComponent(targetUrl)}${requestIdSuffix}`
  }

  const proxyCloudBaseMediaUrl = (targetUrl = '') => {
    if (!targetUrl || typeof window === 'undefined') {
      return targetUrl || ''
    }

    return shouldUseCloudBaseProxy() && isCloudBaseApiUrl(targetUrl)
      ? toProxyUrl(targetUrl)
      : targetUrl
  }

  const getLatestCloudBaseProxyTrace = () => {
    if (!enableTrace || typeof window === 'undefined') {
      return null
    }

    const trace = window[CLOUDBASE_PROXY_TRACE_KEY] || null
    if (!trace?.requestId) {
      return null
    }

    if (Date.now() - Number(trace.recordedAt || 0) > 2 * 60 * 1000) {
      return null
    }

    return trace
  }

  const installCloudBaseRequestProxy = () => {
    if (typeof window === 'undefined' || !shouldUseCloudBaseProxy() || window.__liwuCloudBaseProxyInstalled) {
      return
    }

    const originalOpen = window.XMLHttpRequest.prototype.open
    const originalSend = enableTrace ? window.XMLHttpRequest.prototype.send : null
    const originalFetch = window.fetch.bind(window)

    window.XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      if (typeof url === 'string' && isCloudBaseApiUrl(url)) {
        const requestId = enableTrace ? buildProxyRequestId() : ''
        if (enableTrace) {
          this.__liwuCloudBaseRequestId = requestId
          this.__liwuCloudBaseTarget = url
          rememberProxyTrace({ requestId, target: url, stage: 'request_started', transport: 'xhr' })
        }

        return originalOpen.call(this, method, toProxyUrl(url, requestId), ...rest)
      }

      return originalOpen.call(this, method, url, ...rest)
    }

    if (enableTrace && originalSend) {
      window.XMLHttpRequest.prototype.send = function patchedSend(...args) {
        if (this.__liwuCloudBaseRequestId) {
          this.addEventListener('loadend', () => {
            rememberProxyTrace({
              requestId: this.__liwuCloudBaseRequestId,
              target: this.__liwuCloudBaseTarget || '',
              stage: this.status >= 400 ? 'response_error' : 'response_finished',
              transport: 'xhr',
              status: this.status
            })
          }, { once: true })
        }

        return originalSend.apply(this, args)
      }
    }

    window.fetch = function patchedFetch(input, init) {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input?.url

      if (!rawUrl || !isCloudBaseApiUrl(rawUrl)) {
        return originalFetch(input, init)
      }

      const requestId = enableTrace ? buildProxyRequestId() : ''
      if (enableTrace) {
        rememberProxyTrace({ requestId, target: rawUrl, stage: 'request_started', transport: 'fetch' })
      }

      const finalizeTrace = (response) => {
        if (!enableTrace) {
          return response
        }

        rememberProxyTrace({
          requestId,
          target: rawUrl,
          stage: response.ok ? 'response_finished' : 'response_error',
          transport: 'fetch',
          status: response.status,
          proxyRequestId: response.headers.get('x-liwu-proxy-request-id') || requestId
        })

        return response
      }

      if (typeof input === 'string' || input instanceof URL) {
        return originalFetch(toProxyUrl(rawUrl, requestId), init).then(finalizeTrace)
      }

      return originalFetch(new Request(toProxyUrl(rawUrl, requestId), input), init).then(finalizeTrace)
    }

    window.__liwuCloudBaseProxyInstalled = true
  }

  return {
    proxyCloudBaseMediaUrl,
    installCloudBaseRequestProxy,
    getLatestCloudBaseProxyTrace
  }
}