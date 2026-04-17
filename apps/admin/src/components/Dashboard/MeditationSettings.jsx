import React, { useState } from 'react';

const clampInviterRewardRate = (value) => {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) {
    return 0;
  }

  return Math.min(20, Math.max(0, Math.round(nextValue)));
};

const MeditationSettings = ({
  settings,
  onSave,
  saving,
  error
}) => {
  const [rewardPoints, setRewardPoints] = useState(settings.rewardPoints);
  const [allowRepeatRewards, setAllowRepeatRewards] = useState(settings.allowRepeatRewards);
  const [inviterRewardRate, setInviterRewardRate] = useState(settings.inviterRewardRate || 0);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuccessMessage('');

    await onSave({
      rewardPoints,
      allowRepeatRewards,
      inviterRewardRate: clampInviterRewardRate(inviterRewardRate)
    });

    setSuccessMessage('奖励配置已保存到 CloudBase。');
  };

  return (
    <div style={{ maxWidth: '760px' }}>
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
        }}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>福豆奖励设置</h2>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
          保存后，冥想奖励和邀请返豆都会直接按这里的配置结算。
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label
              htmlFor="meditation-reward-points"
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' }}
            >
              每次冥想完成奖励福豆
            </label>
            <input
              id="meditation-reward-points"
              type="number"
              min="0"
              step="1"
              value={rewardPoints}
              onChange={(event) => setRewardPoints(Math.max(0, Number(event.target.value || 0)))}
              style={{
                width: '100%',
                maxWidth: '240px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #d9d9d9',
                fontSize: '15px'
              }}
            />
          </div>

          <div>
            <label
              htmlFor="inviter-reward-rate"
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' }}
            >
              邀请人返豆比例
            </label>
            <input
              id="inviter-reward-rate"
              type="number"
              min="0"
              max="20"
              step="1"
              value={inviterRewardRate}
              onChange={(event) => setInviterRewardRate(clampInviterRewardRate(event.target.value))}
              style={{
                width: '100%',
                maxWidth: '240px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid #d9d9d9',
                fontSize: '15px'
              }}
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              可设置 0% 到 20%。被邀请人每次获得福豆时，邀请人会按该比例收到返豆。
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              borderRadius: '12px',
              backgroundColor: '#f8f9fb',
              border: '1px solid #eceff5',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={allowRepeatRewards}
              onChange={(event) => setAllowRepeatRewards(event.target.checked)}
              style={{ width: '18px', height: '18px' }}
            />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#333' }}>重复收听继续奖励</div>
              <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                关闭后，同一个冥想节目只在首次完成时发放福豆，后续重复收听只累计时长。
              </div>
            </div>
          </label>

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
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MeditationSettings;
