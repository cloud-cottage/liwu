import React, { useEffect, useMemo, useState } from 'react';

const formatPrice = (value) => `¥${Number(value || 0).toFixed(2)}`;

const StudentMembershipSettings = ({
  settings,
  users,
  onSave,
  saving,
  error
}) => {
  const [draftPlans, setDraftPlans] = useState(settings.plans || []);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    setDraftPlans(settings.plans || []);
  }, [settings.plans]);

  const studentUsers = useMemo(() => (
    users.filter((user) => user.isStudent)
      .sort((left, right) => Number(right.uid || 0) - Number(left.uid || 0))
  ), [users]);

  const handlePriceChange = (planKey, value) => {
    const nextPrice = Math.max(0, Number(value || 0));
    setDraftPlans((currentPlans) => currentPlans.map((plan) => (
      plan.key === planKey
        ? {
            ...plan,
            priceCash: Number.isFinite(nextPrice) ? nextPrice : 0
          }
        : plan
    )));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuccessMessage('');

    await onSave({
      ...settings,
      plans: draftPlans
    });

    setSuccessMessage('学员付费价格已保存到 CloudBase。');
  };

  return (
    <div style={{ display: 'grid', gap: '20px', maxWidth: '920px' }}>
      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>学员付费设置</h2>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
          这里维护【我的】页面里学员付费入口的四档价格。用户提交后会直接创建一笔学员订单，订单由工坊订单体系统一承接。
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
            {draftPlans.map((plan) => (
              <label
                key={plan.key}
                style={{
                  display: 'grid',
                  gap: '8px',
                  padding: '16px',
                  borderRadius: '14px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc'
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{plan.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={plan.priceCash}
                  onChange={(event) => handlePriceChange(plan.key, event.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #d9d9d9',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  当前展示：{formatPrice(plan.priceCash)}
                </span>
              </label>
            ))}
          </div>

          {(error || successMessage) && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: error ? '#fff3f3' : '#f1f8f4',
                color: error ? '#c62828' : '#2e7d32',
                fontSize: '13px',
                lineHeight: 1.6
              }}
            >
              {error || successMessage}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                border: 'none',
                borderRadius: '10px',
                backgroundColor: '#2196F3',
                color: '#fff',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? '保存中...' : '保存学员价格'}
            </button>
          </div>
        </form>
      </section>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>当前学员用户</h3>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b' }}>
              共 {studentUsers.length} 位学员用户
            </div>
          </div>
        </div>

        {studentUsers.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>当前还没有学员用户。</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {studentUsers.slice(0, 12).map((user) => (
              <div
                key={user.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                    {user.name || '未命名用户'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                    UID {user.uid || '未生成'} · {user.phone || '未绑定手机号'}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'right' }}>
                  {user.studentExpireAt ? `有效期至 ${new Date(user.studentExpireAt).toLocaleDateString('zh-CN')}` : '未记录有效期'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default StudentMembershipSettings;
