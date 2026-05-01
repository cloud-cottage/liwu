import React from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const StackPage = ({
  title = '',
  subtitle = '',
  rightSlot = null,
  children,
  contentStyle = {}
}) => {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '18px 20px 32px',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '18px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="返回"
            style={{
              marginTop: '2px',
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              border: '1px solid rgba(143, 165, 138, 0.16)',
              background: 'rgba(255, 255, 255, 0.88)',
              color: 'var(--color-text-secondary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={18} />
          </button>

          <div style={{ minWidth: 0 }}>
            {title && (
              <h1
                style={{
                  margin: 0,
                  fontSize: '28px',
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-text-primary)'
                }}
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p
                style={{
                  margin: '8px 0 0',
                  fontSize: '13px',
                  lineHeight: 1.65,
                  color: 'var(--color-text-secondary)'
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {rightSlot}
      </div>

      <div style={contentStyle}>
        {children}
      </div>
    </div>
  )
}

export default StackPage
