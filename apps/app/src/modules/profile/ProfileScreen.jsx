import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Award, BookOpen, LogOut, MessageSquareText, ShieldCheck, ShoppingBag, Smartphone, UserRound, Wallet, X } from 'lucide-react';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import { useBadgeState } from '../../hooks/useBadgeState.js';
import { authService } from '../../services/cloudbase';

const normalizePhoneInput = (value = '') => String(value || '').replace(/[^\d+]/g, '').trim();

const isValidPhoneNumber = (value = '') => /^(?:\+?86)?1\d{10}$/.test(normalizePhoneInput(value));

const getLoginMethodLabel = (loginMethod = '') => {
  if (loginMethod === 'phone') {
    return '手机号验证码登录';
  }

  if (loginMethod === 'wechat') {
    return '微信登录';
  }

  if (loginMethod === 'anonymous') {
    return '游客模式';
  }

  return '已登录';
};

const getDisplayName = (authStatus, currentUser) => {
  if (authStatus?.isAnonymous) {
    return '游客';
  }

  return currentUser?.name || authStatus?.displayName || '未登录用户';
};

const getAuthHeadline = (authStatus) => {
  if (authStatus?.isAuthenticated) {
    return '账号已登录';
  }

  if (authStatus?.isAnonymous) {
    return '当前为游客模式';
  }

  return '登录你的账号';
};

const InfoCard = ({ icon, label, value, accent, onClick }) => {
  const Element = onClick ? 'button' : 'div';

  return (
    <Element
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        backgroundColor: '#fff',
        padding: '16px',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-sm)',
        border: 'none',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', color: accent }}>
      {React.createElement(icon, { size: 18, style: { marginRight: '8px' } })}
      <span style={{ fontSize: '12px', fontWeight: '500' }}>{label}</span>
    </div>
    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{value}</div>
    </Element>
  );
};

const LoginModal = ({
  open,
  onClose,
  phoneNumber,
  verificationCode,
  codeRequested,
  sendingCode,
  verifyingCode,
  wechatLoading,
  oauthProcessing,
  feedbackMessage,
  errorMessage,
  onPhoneChange,
  onCodeChange,
  onSendCode,
  onPhoneLogin,
  onWechatLogin
}) => {
  if (!open && !oauthProcessing) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
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
          maxWidth: '420px',
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '22px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>登录账号</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              手机号验证码固定为 1234
            </div>
          </div>
          {!oauthProcessing && (
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
          )}
        </div>

        {(feedbackMessage || errorMessage) && !oauthProcessing && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: errorMessage ? '#fff1f2' : '#eff6ff',
              color: errorMessage ? '#be123c' : '#1d4ed8',
              fontSize: '13px',
              lineHeight: 1.6,
              marginBottom: '16px'
            }}
          >
            {errorMessage || feedbackMessage}
          </div>
        )}

        {oauthProcessing ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '12px',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              fontSize: '14px'
            }}
          >
            正在处理微信登录回调...
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor="profile-phone" style={{ display: 'block', fontSize: '13px', color: '#334155', marginBottom: '8px' }}>
                手机号码
              </label>
              <input
                id="profile-phone"
                name="profile-phone"
                type="tel"
                inputMode="numeric"
                placeholder="请输入手机号"
                value={phoneNumber}
                onChange={onPhoneChange}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #dbe4ee',
                  fontSize: '15px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: codeRequested ? '1fr 1fr' : '1fr', gap: '12px', marginBottom: '12px' }}>
              {codeRequested && (
                <input
                  id="profile-code"
                  name="profile-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="输入验证码"
                  value={verificationCode}
                  onChange={onCodeChange}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #dbe4ee',
                    fontSize: '15px',
                    boxSizing: 'border-box'
                  }}
                />
              )}

              <button
                type="button"
                onClick={onSendCode}
                disabled={sendingCode}
                style={{
                  border: 'none',
                  borderRadius: '12px',
                  backgroundColor: '#111827',
                  color: '#fff',
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: sendingCode ? 'default' : 'pointer',
                  opacity: sendingCode ? 0.7 : 1
                }}
              >
                {sendingCode ? '发送中...' : '发送验证码'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={onPhoneLogin}
                disabled={verifyingCode || !codeRequested}
                style={{
                  border: 'none',
                  borderRadius: '12px',
                  backgroundColor: codeRequested ? '#2563eb' : '#cbd5e1',
                  color: '#fff',
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: codeRequested && !verifyingCode ? 'pointer' : 'default',
                  opacity: verifyingCode ? 0.7 : 1
                }}
              >
                {verifyingCode ? '登录中...' : '手机号登录'}
              </button>

              <button
                type="button"
                onClick={onWechatLogin}
                disabled={wechatLoading}
                style={{
                  border: '1px solid #16a34a',
                  borderRadius: '12px',
                  backgroundColor: '#f0fdf4',
                  color: '#15803d',
                  padding: '12px 14px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: wechatLoading ? 'default' : 'pointer',
                  opacity: wechatLoading ? 0.7 : 1
                }}
              >
                {wechatLoading ? '跳转中...' : '微信登录'}
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.7, marginTop: '12px' }}>
              当前开发阶段手机号验证码固定为 1234。微信登录会先跳转微信授权，回到应用后绑定你填写的手机号。
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Profile = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { balance, history, syncWalletFromCloud } = useWealth();
  const {
    authStatus,
    currentUser,
    refreshData,
    syncAuthState
  } = useCloudAwareness();
  const { equippedBadge } = useBadgeState();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [wechatLoading, setWechatLoading] = useState(false);
  const [oauthProcessing, setOauthProcessing] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const recentEntries = useMemo(() => history.slice(0, 5), [history]);

  useEffect(() => {
    let cancelled = false;

    const completeOAuth = async () => {
      if (!authService.hasOAuthRedirectParams()) {
        return;
      }

      setOauthProcessing(true);
      setErrorMessage('');
      setFeedbackMessage('');

      try {
        await authService.completeWechatLogin();
        await Promise.all([
          syncAuthState({ allowAnonymous: false }),
          refreshData({ force: true, allowAnonymous: true }),
          syncWalletFromCloud({ refresh: true, allowAnonymous: true })
        ]);

        if (!cancelled) {
          setPhoneNumber('');
          setVerificationCode('');
          setCodeRequested(false);
          setIsLoginModalOpen(false);
          setFeedbackMessage('微信登录成功');
          navigate('/profile', { replace: true });
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || '微信登录失败');
          navigate('/profile', { replace: true });
        }
      } finally {
        if (!cancelled) {
          setOauthProcessing(false);
        }
      }
    };

    void completeOAuth();

    return () => {
      cancelled = true;
    };
  }, [location.search, navigate, refreshData, syncAuthState, syncWalletFromCloud]);

  const handleSendCode = async () => {
    const normalizedPhone = normalizePhoneInput(phoneNumber);

    if (!isValidPhoneNumber(normalizedPhone)) {
      setErrorMessage('请输入有效的手机号');
      return;
    }

    setSendingCode(true);
    setErrorMessage('');
    setFeedbackMessage('');

    try {
      await authService.requestPhoneOtp(normalizedPhone);
      setCodeRequested(true);
      setFeedbackMessage('模拟验证码已发送，当前固定为 1234');
    } catch (error) {
      setErrorMessage(error.message || '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handlePhoneLogin = async () => {
    const normalizedPhone = normalizePhoneInput(phoneNumber);

    if (!isValidPhoneNumber(normalizedPhone)) {
      setErrorMessage('请输入有效的手机号');
      return;
    }

    if (!verificationCode.trim()) {
      setErrorMessage('请输入验证码');
      return;
    }

    setVerifyingCode(true);
    setErrorMessage('');
    setFeedbackMessage('');

    try {
      await authService.verifyPhoneOtp({
        phone: normalizedPhone,
        code: verificationCode
      });

      await Promise.all([
        syncAuthState({ allowAnonymous: false }),
        refreshData({ force: true, allowAnonymous: true }),
        syncWalletFromCloud({ refresh: true, allowAnonymous: true })
      ]);

      setFeedbackMessage('手机号登录成功');
      setVerificationCode('');
      setCodeRequested(false);
      setIsLoginModalOpen(false);
    } catch (error) {
      setErrorMessage(error.message || '登录失败');
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleWechatLogin = async () => {
    const normalizedPhone = normalizePhoneInput(phoneNumber);

    if (!isValidPhoneNumber(normalizedPhone)) {
      setErrorMessage('请输入有效的手机号');
      return;
    }

    setWechatLoading(true);
    setErrorMessage('');
    setFeedbackMessage('');

    try {
      await authService.startWechatLogin({
        phone: normalizedPhone,
        redirectTo: `${window.location.origin}/profile`
      });
    } catch (error) {
      setErrorMessage(error.message || '微信登录失败');
      setWechatLoading(false);
    }
  };

  const handleLogout = async () => {
    setErrorMessage('');
    setFeedbackMessage('');

    const result = await authService.signOut();
    if (!result.success) {
      setErrorMessage(result.error?.message || '退出登录失败');
      return;
    }

    await Promise.all([
      syncAuthState({ allowAnonymous: false }),
      syncWalletFromCloud({ allowAnonymous: false })
    ]);

    setPhoneNumber('');
    setVerificationCode('');
    setCodeRequested(false);
    setIsLoginModalOpen(false);
    setFeedbackMessage('已退出登录');
  };

  return (
    <div style={{ padding: '20px', paddingBottom: '80px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>我的</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>
          {getAuthHeadline(authStatus)}
        </p>
      </div>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-bg-secondary)',
              marginRight: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <UserRound size={28} color="var(--color-accent-ink)" />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', margin: 0, fontFamily: 'var(--font-serif)' }}>
              {getDisplayName(authStatus, currentUser)}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '12px',
                  color: authStatus.isAuthenticated ? '#0f766e' : '#2563eb',
                  backgroundColor: authStatus.isAuthenticated ? 'rgba(15, 118, 110, 0.12)' : 'rgba(37, 99, 235, 0.12)',
                  padding: '4px 10px',
                  borderRadius: '999px'
                }}
              >
                {authStatus.isAnonymous ? '游客模式' : getLoginMethodLabel(authStatus.loginMethod)}
              </span>
              {currentUser?.isStudent && (
                <span
                  style={{
                    fontSize: '12px',
                    color: '#b45309',
                    backgroundColor: 'rgba(217, 119, 6, 0.14)',
                    padding: '4px 10px',
                    borderRadius: '999px'
                  }}
                >
                  学员
                </span>
              )}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '10px 0 0' }}>
              手机号：{currentUser?.phone || authStatus.phoneNumber || '未绑定'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
              邀请码：{currentUser?.inviteCode || '生成中'}
            </p>
          </div>
        </div>

        {(feedbackMessage || errorMessage) && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: '10px',
              backgroundColor: errorMessage ? '#fff1f2' : '#eff6ff',
              color: errorMessage ? '#be123c' : '#1d4ed8',
              fontSize: '13px',
              lineHeight: 1.6,
              marginBottom: '16px'
            }}
          >
            {errorMessage || feedbackMessage}
          </div>
        )}

        {!authStatus.isAuthenticated && (
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: '10px' }}>
              登录后可保存账号状态
            </div>
            <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7, marginBottom: '14px' }}>
              手机号验证码和微信登录都收在模态框里，当前开发阶段验证码固定为 1234。
            </div>
            <button
              type="button"
              onClick={() => {
                setErrorMessage('');
                setFeedbackMessage('');
                setIsLoginModalOpen(true);
              }}
              style={{
                border: 'none',
                borderRadius: '12px',
                backgroundColor: '#0f172a',
                color: '#fff',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Smartphone size={16} />
              打开登录弹窗
            </button>
          </div>
        )}

        {authStatus.isAuthenticated && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
              登录方式：{getLoginMethodLabel(authStatus.loginMethod)}<br />
              {currentUser?.email || authStatus.email ? `邮箱：${currentUser?.email || authStatus.email}` : '邮箱：未绑定'}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                border: 'none',
                borderRadius: '12px',
                backgroundColor: '#0f172a',
                color: '#fff',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <LogOut size={16} />
              退出登录
            </button>
          </div>
        )}
      </section>

      <LoginModal
        open={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        phoneNumber={phoneNumber}
        verificationCode={verificationCode}
        codeRequested={codeRequested}
        sendingCode={sendingCode}
        verifyingCode={verifyingCode}
        wechatLoading={wechatLoading}
        oauthProcessing={oauthProcessing}
        feedbackMessage={feedbackMessage}
        errorMessage={errorMessage}
        onPhoneChange={(event) => {
          setPhoneNumber(normalizePhoneInput(event.target.value));
          setErrorMessage('');
        }}
        onCodeChange={(event) => {
          setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6));
          setErrorMessage('');
        }}
        onSendCode={handleSendCode}
        onPhoneLogin={handlePhoneLogin}
        onWechatLogin={handleWechatLogin}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '30px' }}>
        <InfoCard
          icon={BookOpen}
          label="花开纪念册"
          value={equippedBadge?.name || '未佩戴徽章'}
          accent="var(--color-accent-clay)"
          onClick={() => navigate('/album')}
        />
        <InfoCard
          icon={Award}
          label="福豆"
          value={balance}
          accent="var(--color-text-secondary)"
          onClick={() => navigate('/fortune-ledger')}
        />
      </div>

      <section style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <ShieldCheck size={16} color="var(--color-accent-ink)" />
          <h3 style={{ fontSize: '16px', margin: 0 }}>账号说明</h3>
        </div>
        <div
          style={{
            backgroundColor: '#fff',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-sm)',
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.8
          }}
        >
          <div>1. 游客模式下仍可浏览和使用基础功能。</div>
          <div>2. 手机号登录通过短信验证码完成，不需要设置密码。</div>
          <div>3. 微信登录会走 CloudBase OAuth，并在回跳后记录你填写的手机号。</div>
        </div>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Wallet size={16} color="var(--color-accent-ink)" />
          <h3 style={{ fontSize: '16px', margin: 0 }}>工坊入口</h3>
        </div>
        <button
          type="button"
          onClick={() => navigate('/shop')}
          style={{
            width: '100%',
            border: 'none',
            backgroundColor: '#fff',
            padding: '18px',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            textAlign: 'left'
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '16px',
              backgroundColor: '#eef2ff',
              color: '#312e81',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <ShoppingBag size={22} />
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>工坊</div>
            <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b', lineHeight: 1.6 }}>
              查看线上店铺、福豆兑换与订单流程
            </div>
          </div>
        </button>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <MessageSquareText size={16} color="var(--color-accent-ink)" />
          <h3 style={{ fontSize: '16px', margin: 0 }}>最近福豆记录</h3>
        </div>
        {recentEntries.length === 0 ? (
          <div
            style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
              fontSize: '14px'
            }}
          >
            暂无记录
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recentEntries.map((item) => (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ fontSize: '14px' }}>{item.description}</div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: item.type === 'EARN' ? 'var(--color-success)' : 'var(--color-accent-ink)'
                  }}
                >
                  {item.type === 'EARN' ? '+' : ''} {item.amount}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Profile;
