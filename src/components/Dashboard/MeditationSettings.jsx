import React, { useState } from 'react';

const MeditationSettings = ({
  settings,
  onSave,
  saving,
  error
}) => {
  const [rewardPoints, setRewardPoints] = useState(settings.rewardPoints);
  const [allowRepeatRewards, setAllowRepeatRewards] = useState(settings.allowRepeatRewards);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSuccessMessage('');

    await onSave({
      rewardPoints,
      allowRepeatRewards
    });

    setSuccessMessage('冥想奖励配置已保存到 CloudBase。');
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
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>冥想奖励设置</h2>
        <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
          控制前台冥想完成后的积分发放逻辑。保存后，用户下一次完成冥想会按这里的配置结算。
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label
              htmlFor="meditation-reward-points"
              style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: '#333' }}
            >
              每次冥想完成奖励积分
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
                关闭后，同一个冥想节目只在首次完成时发放积分，后续重复收听只累计时长。
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
