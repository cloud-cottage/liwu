import React from 'react'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const WebExperienceBanner = () => {
  const navigate = useNavigate()

  return (
    <button
      type="button"
      onClick={() => navigate('/download')}
      style={{
        width: '100%',
        border: '1px solid rgba(143, 165, 138, 0.18)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.96), rgba(238, 245, 236, 0.94))',
        borderRadius: '18px',
        padding: '14px 16px',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
            lineHeight: 1.6
          }}
        >
          📱 理悟专为手机设计 | 电脑端功能受限
        </div>
        <div
          style={{
            marginTop: '4px',
            fontSize: '13px',
            color: 'var(--color-text-secondary)'
          }}
        >
          下载 APP 获得完整体验
        </div>
      </div>

      <span
        style={{
          width: '34px',
          height: '34px',
          borderRadius: '999px',
          background: 'rgba(143, 165, 138, 0.14)',
          color: 'var(--color-text-primary)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <ArrowRight size={18} />
      </span>
    </button>
  )
}

export default WebExperienceBanner
