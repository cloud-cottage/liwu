import React, { useEffect, useMemo, useState } from 'react'
import { Download, Smartphone } from 'lucide-react'
import StackPage from '@app/components/Layout/StackPage.jsx'
import { clientDistributionSettingsService, DEFAULT_CLIENT_DISTRIBUTION_SETTINGS } from '@app/services/cloudbase'

const actionButtonStyle = (enabled = true) => ({
  width: '100%',
  padding: '14px 16px',
  borderRadius: '14px',
  border: enabled ? 'none' : '1px dashed rgba(148, 163, 184, 0.45)',
  background: enabled ? 'var(--theme-button-primary-bg)' : 'rgba(255,255,255,0.74)',
  color: enabled ? 'var(--theme-button-primary-text)' : '#64748b',
  fontSize: '15px',
  fontWeight: 700,
  cursor: enabled ? 'pointer' : 'default'
})

const cardStyle = {
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,245,239,0.94))',
  borderRadius: '22px',
  padding: '20px',
  boxShadow: 'var(--shadow-sm)',
  border: '1px solid rgba(143, 165, 138, 0.12)'
}

const DownloadPage = () => {
  const [settings, setSettings] = useState(DEFAULT_CLIENT_DISTRIBUTION_SETTINGS)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const nextSettings = await clientDistributionSettingsService.getSettings()
      if (!cancelled) {
        setSettings(nextSettings)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const androidUrl = useMemo(() => String(settings.androidApkUrl || '').trim(), [settings.androidApkUrl])
  const iosUrl = useMemo(() => String(settings.iosDistributionUrl || '').trim(), [settings.iosDistributionUrl])

  return (
    <StackPage
      title="下载 APP"
      subtitle="理悟的完整体验目前以手机为主。安卓安装包可直接下载，iPhone 安装链路先预留在这里。"
      contentStyle={{ display: 'grid', gap: '16px' }}
    >
      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <span
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '14px',
              background: 'rgba(143, 165, 138, 0.14)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-primary)'
            }}
          >
            <Smartphone size={20} />
          </span>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Android 安装包</div>
            <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              适用于安卓手机，可直接下载安装。
            </div>
          </div>
        </div>

        {androidUrl ? (
          <button type="button" onClick={() => window.open(androidUrl, '_blank', 'noopener,noreferrer')} style={actionButtonStyle(true)}>
            下载 Android APK
          </button>
        ) : (
          <div style={{ ...actionButtonStyle(false), textAlign: 'center' }}>安装包地址暂未配置</div>
        )}
      </section>

      <section style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <span
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '14px',
              background: 'rgba(214, 140, 101, 0.14)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-primary)'
            }}
          >
            <Download size={20} />
          </span>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-text-primary)' }}>iPhone 安装入口</div>
            <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              测试分发与正式上架入口后续会放在这里。
            </div>
          </div>
        </div>

        {iosUrl ? (
          <button type="button" onClick={() => window.open(iosUrl, '_blank', 'noopener,noreferrer')} style={actionButtonStyle(true)}>
            打开 iPhone 安装链接
          </button>
        ) : (
          <div style={{ ...actionButtonStyle(false), textAlign: 'center' }}>iPhone 安装链接暂未配置</div>
        )}
      </section>

      <section
        style={{
          ...cardStyle,
          padding: '18px 20px'
        }}
      >
        <div style={{ fontSize: '13px', lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>
          部分说明内容暂时留空。后续这里会补充版本号、更新说明、安装提示和常见问题。
        </div>
      </section>
    </StackPage>
  )
}

export default DownloadPage
