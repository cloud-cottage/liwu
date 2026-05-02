import React, { Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useCloudAwareness } from '@app/context/CloudAwarenessContext.jsx'
import '../admin/index.css'

const Dashboard = React.lazy(() => import('../admin/pages/Dashboard.jsx'))
const ADMIN_PHONE = '16601061656'

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '')

const WebAdminPage = () => {
  const { authStatus, currentUser, loading } = useCloudAwareness()
  const currentPhone = normalizePhone(currentUser?.phone || authStatus?.phoneNumber || '')
  const authorized = currentPhone === ADMIN_PHONE

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', padding: '32px 24px', boxSizing: 'border-box' }}>
        <div style={{ fontSize: '15px', color: 'var(--color-text-secondary)' }}>正在验证管理员身份...</div>
      </div>
    )
  }

  if (!authorized) {
    return (
      <div
        style={{
          minHeight: '100vh',
          padding: '32px 24px',
          boxSizing: 'border-box',
          background: 'var(--color-bg-primary)'
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            margin: '0 auto',
            padding: '24px',
            borderRadius: '24px',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,245,239,0.94))',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div style={{ fontSize: '28px', fontFamily: 'var(--font-serif)', color: 'var(--color-text-primary)' }}>未授权访问</div>
          <div style={{ marginTop: '10px', fontSize: '14px', lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>
            这个入口只对指定管理员开放。当前允许访问的管理员手机号是 {ADMIN_PHONE}。
          </div>
          <div style={{ marginTop: '18px' }}>
            <Link
              to="/profile"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '12px 16px',
                borderRadius: '14px',
                background: 'var(--theme-button-primary-bg)',
                color: 'var(--theme-button-primary-text)',
                fontWeight: 700,
                textDecoration: 'none'
              }}
            >
              前往我的页面登录
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', padding: '32px 24px', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '15px', color: 'var(--color-text-secondary)' }}>正在加载管理面板...</div>
        </div>
      }
    >
      <Dashboard />
    </Suspense>
  )
}

export default WebAdminPage
