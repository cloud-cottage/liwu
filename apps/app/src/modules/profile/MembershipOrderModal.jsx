import React from 'react';
import { X } from 'lucide-react';

const formatCurrency = (value = 0) => `¥${Number(value || 0).toFixed(2)}`;

const inlinePrimaryButtonStyle = {
  border: 'none',
  borderRadius: '10px',
  background: 'var(--theme-button-primary-bg)',
  color: 'var(--theme-button-primary-text)',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-sm)'
};

const inlineSecondaryButtonStyle = {
  border: '1px solid #dbe4ee',
  borderRadius: '10px',
  backgroundColor: '#fff',
  color: '#334155',
  padding: '8px 12px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer'
};

const MembershipOrderModal = ({
  open,
  settings,
  loading,
  submitting,
  selectedPlanKey,
  onSelectPlan,
  onClose,
  onSubmit
}) => {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 41,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '22px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>付费学员</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              选择一个方案后，会创建一笔待支付订单。
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              fontSize: '14px'
            }}
          >
            正在加载学员方案...
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gap: '12px' }}>
              {(settings?.plans || []).map((plan) => {
                const selected = selectedPlanKey === plan.key;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => onSelectPlan(plan.key)}
                    style={{
                      borderRadius: '16px',
                      border: selected ? '1.5px solid rgba(214, 140, 101, 0.48)' : '1px solid #e2e8f0',
                      background: selected ? 'rgba(214, 140, 101, 0.08)' : '#fff',
                      padding: '14px 16px',
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{plan.label}</div>
                      <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                        {plan.isLifetime ? '一次开通，长期有效' : `开通 ${plan.durationMonths} 个月学员身份`}
                      </div>
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                      {formatCurrency(plan.priceCash)}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={inlineSecondaryButtonStyle}
              >
                取消
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting || !selectedPlanKey}
                style={{
                  ...inlinePrimaryButtonStyle,
                  opacity: submitting || !selectedPlanKey ? 0.7 : 1,
                  cursor: submitting || !selectedPlanKey ? 'default' : 'pointer'
                }}
              >
                {submitting ? '创建中...' : '创建订单'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MembershipOrderModal;
