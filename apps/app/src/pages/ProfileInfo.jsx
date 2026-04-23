import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, LogOut, Pencil, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCloudAwareness } from '../context/CloudAwarenessContext.jsx';
import { useWealth } from '../context/WealthContext.jsx';
import { authService, studentMembershipService, userProfileService } from '../services/cloudbase.js';
import MembershipOrderModal from '../modules/profile/MembershipOrderModal.jsx';
import { uploadImageAsWebp } from '../utils/imageUpload.js';

const MAX_PROFILE_NAME_LENGTH = 16;

const primaryButtonStyle = {
  border: 'none',
  borderRadius: '14px',
  background: 'var(--theme-button-primary-bg)',
  color: 'var(--theme-button-primary-text)',
  padding: '12px 16px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: 'var(--shadow-sm)'
};

const secondaryButtonStyle = {
  border: '1px solid rgba(15, 23, 42, 0.12)',
  borderRadius: '14px',
  backgroundColor: '#fff',
  color: '#334155',
  padding: '12px 16px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer'
};

const inlineNameIconButtonStyle = {
  width: '30px',
  height: '30px',
  borderRadius: '999px',
  border: '1px solid rgba(15, 23, 42, 0.08)',
  backgroundColor: 'rgba(255, 255, 255, 0.92)',
  color: '#475569',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: 'var(--shadow-sm)',
  flexShrink: 0
};

const InfoMessage = ({ tone = 'info', children }) => (
  <div
    style={{
      padding: '12px 14px',
      borderRadius: '12px',
      backgroundColor: tone === 'error' ? '#fff1f2' : '#eff6ff',
      color: tone === 'error' ? '#be123c' : '#1d4ed8',
      fontSize: '13px',
      lineHeight: 1.6
    }}
  >
    {children}
  </div>
);

const ProfileAvatar = ({ avatar, disabled = false, onClick, uploading = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      position: 'relative',
      width: '112px',
      height: '112px',
      borderRadius: '32px',
      border: 'none',
      padding: 0,
      background: 'linear-gradient(135deg, rgba(214, 140, 101, 0.12), rgba(107, 142, 35, 0.16))',
      overflow: 'hidden',
      cursor: disabled ? 'default' : 'pointer',
      boxShadow: 'var(--shadow-sm)'
    }}
    aria-label={disabled ? '头像' : '修改头像'}
    title={disabled ? '头像' : '修改头像'}
  >
    {avatar ? (
      <img
        src={avatar}
        alt="用户头像"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block'
        }}
      />
    ) : (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-accent-ink)'
        }}
      >
        <UserRound size={42} />
      </div>
    )}

    <div
      style={{
        position: 'absolute',
        right: '10px',
        bottom: '10px',
        width: '32px',
        height: '32px',
        borderRadius: '999px',
        backgroundColor: 'rgba(15, 23, 42, 0.78)',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.24)'
      }}
    >
      <Camera size={16} />
    </div>

    {uploading && (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.42)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 600
        }}
      >
        上传中...
      </div>
    )}
  </button>
);

const formatStudentExpireText = (value = '') => {
  if (!value) {
    return '待开通';
  }

  const expireDate = new Date(value);
  if (Number.isNaN(expireDate.getTime())) {
    return '待开通';
  }

  if (expireDate.getFullYear() >= 2999) {
    return '长期有效';
  }

  return expireDate.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
};

const ProfileInfo = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { syncWalletFromCloud } = useWealth();
  const {
    authStatus,
    currentUser,
    refreshData,
    syncAuthState
  } = useCloudAwareness();

  const [nameDraft, setNameDraft] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [membershipSettings, setMembershipSettings] = useState(null);
  const [loadingMembershipSettings, setLoadingMembershipSettings] = useState(false);
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);
  const [selectedMembershipPlanKey, setSelectedMembershipPlanKey] = useState('');
  const [submittingMembershipOrder, setSubmittingMembershipOrder] = useState(false);

  useEffect(() => {
    setNameDraft(currentUser?.name || '');
  }, [currentUser?.name]);

  useEffect(() => {
    if (!isMembershipModalOpen) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoadingMembershipSettings(true);
      try {
        const nextSettings = await studentMembershipService.getSettings();
        if (cancelled) {
          return;
        }

        setMembershipSettings(nextSettings);
        setSelectedMembershipPlanKey((currentPlanKey) => (
          currentPlanKey || nextSettings.plans?.[0]?.key || ''
        ));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || '学员方案加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoadingMembershipSettings(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isMembershipModalOpen]);

  const handleBack = () => {
    navigate('/profile');
  };

  const handleSaveName = async () => {
    const normalizedName = String(nameDraft || '').trim();

    if (!normalizedName) {
      setErrorMessage('请输入用户名');
      return;
    }

    setSavingName(true);
    setFeedbackMessage('');
    setErrorMessage('');

    try {
      await userProfileService.updateCurrentProfile({ name: normalizedName });
      await Promise.all([
        syncAuthState({ allowAnonymous: false }),
        refreshData({ force: true, allowAnonymous: true })
      ]);
      setFeedbackMessage('用户名已更新');
      setIsEditingName(false);
    } catch (error) {
      setErrorMessage(error.message || '用户名更新失败');
    } finally {
      setSavingName(false);
    }
  };

  const handleOpenMembershipEntry = () => {
    if (!authStatus.isAuthenticated) {
      setErrorMessage('请先登录后再开通学员身份');
      return;
    }

    setErrorMessage('');
    setFeedbackMessage('');
    setIsMembershipModalOpen(true);
  };

  const handleCreateMembershipOrder = async () => {
    if (!selectedMembershipPlanKey) {
      setErrorMessage('请先选择一个学员方案');
      return;
    }

    setSubmittingMembershipOrder(true);
    setErrorMessage('');
    setFeedbackMessage('');

    try {
      const result = await studentMembershipService.createOrder(selectedMembershipPlanKey);
      setIsMembershipModalOpen(false);
      setFeedbackMessage(`已创建${result.plan.label}订单，订单号 ${result.order.orderNo}。后台确认支付后会自动开通或续期学员身份。`);
    } catch (error) {
      setErrorMessage(error.message || '学员订单创建失败');
    } finally {
      setSubmittingMembershipOrder(false);
    }
  };

  const handleSelectAvatar = () => {
    if (!authStatus.isAuthenticated) {
      setErrorMessage('请先登录后再修改头像');
      return;
    }

    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setUploadingAvatar(true);
    setFeedbackMessage('');
    setErrorMessage('');

    try {
      const uploadResult = await uploadImageAsWebp({
        file,
        cloudPath: `liwu/user-avatar/${currentUser?.uid || currentUser?.id || Date.now()}-${Date.now()}.webp`
      });

      await userProfileService.updateCurrentProfile({ avatar: uploadResult.imageUrl });
      await Promise.all([
        syncAuthState({ allowAnonymous: false }),
        refreshData({ force: true, allowAnonymous: true })
      ]);

      setFeedbackMessage('头像已更新');
    } catch (error) {
      setErrorMessage(error.message || '头像上传失败');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    setFeedbackMessage('');
    setErrorMessage('');

    try {
      const result = await authService.signOut();
      if (!result.success) {
        throw result.error || new Error('退出登录失败');
      }

      await Promise.all([
        syncAuthState({ allowAnonymous: false }),
        syncWalletFromCloud({ allowAnonymous: false })
      ]);

      navigate('/profile', { replace: true });
    } catch (error) {
      setErrorMessage(error.message || '退出登录失败');
    } finally {
      setLoggingOut(false);
    }
  };

  const profileName = currentUser?.name || authStatus.displayName || '未登录用户';
  const identityTitle = authStatus.isAuthenticated
    ? (currentUser?.isStudent ? '学员用户' : '普通用户')
    : '游客模式';
  const identityDescription = authStatus.isAuthenticated
    ? (currentUser?.isStudent ? '你正在以学员身份同行。' : '当前以普通用户身份使用理悟。')
    : '登录后可保存资料并开通学员身份。';
  const expireText = currentUser?.isStudent ? formatStudentExpireText(currentUser?.studentExpireAt) : '开通后显示';

  return (
    <div className="page-container" style={{ padding: '20px', paddingBottom: '96px' }}>
      <button
        type="button"
        onClick={handleBack}
        style={{
          border: 'none',
          background: 'none',
          color: 'var(--color-text-secondary)',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        <ArrowLeft size={18} />
        返回我的
      </button>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '18px'
        }}
      >
        <h1 style={{ fontSize: '28px', margin: 0 }}>个人信息</h1>
        <p style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          在这里管理头像、用户名与账号状态。
        </p>

        <div
          style={{
            marginTop: '22px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}
        >
          <ProfileAvatar
            avatar={currentUser?.avatar || ''}
            disabled={!authStatus.isAuthenticated || uploadingAvatar}
            onClick={handleSelectAvatar}
            uploading={uploadingAvatar}
          />
          <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            {authStatus.isAuthenticated ? '点击头像更新，上传时会自动转换为 webP。' : '登录后可上传头像。'}
          </div>
        </div>
      </section>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '18px 20px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '18px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
            <span>欢迎你！</span>
            <span style={{ fontWeight: 700, color: '#111827', marginLeft: '6px' }}>{identityTitle}</span>
            {currentUser?.isStudent ? (
              <span style={{ marginLeft: '10px' }}>你的身份有效期至 {expireText}</span>
            ) : authStatus.isAuthenticated ? null : (
              <span style={{ marginLeft: '10px' }}>{identityDescription}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenMembershipEntry}
            disabled={!authStatus.isAuthenticated}
            style={{
              ...primaryButtonStyle,
              opacity: authStatus.isAuthenticated ? 1 : 0.6,
              cursor: authStatus.isAuthenticated ? 'pointer' : 'default'
            }}
          >
            {currentUser?.isStudent ? '续费' : '成为学员'}
          </button>
        </div>
      </section>

      {(feedbackMessage || errorMessage) && (
        <div style={{ marginBottom: '18px' }}>
          <InfoMessage tone={errorMessage ? 'error' : 'info'}>
            {errorMessage || feedbackMessage}
          </InfoMessage>
        </div>
      )}

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '18px'
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>用户名</div>
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
            {profileName}
          </div>
          {authStatus.isAuthenticated && !isEditingName && (
            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setFeedbackMessage('');
                setNameDraft(profileName);
                setIsEditingName(true);
              }}
              aria-label="修改用户名"
              title="修改用户名"
              style={inlineNameIconButtonStyle}
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          用户名每 3 天可修改一次。
        </div>
        {isEditingName && (
          <div style={{ marginTop: '16px' }}>
            <input
              type="text"
              value={nameDraft}
              maxLength={MAX_PROFILE_NAME_LENGTH}
              onChange={(event) => setNameDraft(event.target.value)}
              disabled={!authStatus.isAuthenticated || savingName}
              placeholder="输入用户名"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '14px 16px',
                borderRadius: '14px',
                border: '1px solid rgba(15, 23, 42, 0.1)',
                fontSize: '14px',
                color: '#0f172a',
                backgroundColor: authStatus.isAuthenticated ? '#fff' : '#f8fafc'
              }}
            />
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSaveName}
                disabled={!authStatus.isAuthenticated || savingName}
                style={{
                  ...primaryButtonStyle,
                  opacity: !authStatus.isAuthenticated || savingName ? 0.6 : 1,
                  cursor: !authStatus.isAuthenticated || savingName ? 'default' : 'pointer'
                }}
              >
                {savingName ? '保存中...' : '保存用户名'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingName(false);
                  setNameDraft(profileName);
                }}
                disabled={savingName}
                style={secondaryButtonStyle}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>账号操作</div>
        <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleLogout}
            disabled={!authStatus.isAuthenticated || loggingOut}
            style={{
              ...secondaryButtonStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              opacity: !authStatus.isAuthenticated || loggingOut ? 0.6 : 1,
              cursor: !authStatus.isAuthenticated || loggingOut ? 'default' : 'pointer'
            }}
          >
            <LogOut size={16} />
            {loggingOut ? '退出中...' : '退出登录'}
          </button>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarChange}
        style={{ display: 'none' }}
      />

      <MembershipOrderModal
        open={isMembershipModalOpen}
        settings={membershipSettings}
        loading={loadingMembershipSettings}
        submitting={submittingMembershipOrder}
        selectedPlanKey={selectedMembershipPlanKey}
        onSelectPlan={setSelectedMembershipPlanKey}
        onClose={() => setIsMembershipModalOpen(false)}
        onSubmit={handleCreateMembershipOrder}
      />
    </div>
  );
};

export default ProfileInfo;
