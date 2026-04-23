import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Award, BookOpen, MessageSquareText, Smartphone, UserRound, X } from 'lucide-react';
import { DEFAULT_CLIENT_THEME_SETTINGS } from '@liwu/shared-utils/theme-system.js';
import FortuneBeanIcon from '../../components/Icons/FortuneBeanIcon.jsx';
import { useWealth } from '../../context/WealthContext';
import { useCloudAwareness } from '../../context/CloudAwarenessContext';
import { useBadgeState } from '../../hooks/useBadgeState.js';
import { authService, studentMembershipService, themeSettingsService } from '../../services/cloudbase';
import MembershipOrderModal from './MembershipOrderModal.jsx';

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

const MembershipIcon = ({ size = 22, style = {}, ...rest }) => (
  <svg viewBox="0 0 1024 1024" width={size} height={size} fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={style} {...rest}>
    <path d="M721.408 897.706667H324.309333c-125.866667 0-228.309333-110.08-228.309333-245.333334V243.626667c0-55.466667 23.808-74.666667 38.101333-81.066667 14.293333-6.4 43.690667-11.093333 80.213334 28.16l102.826666 110.506667c4.010667 4.266667 10.368 4.266667 13.952 0l142.506667-153.173334c26.24-28.16 72.277333-28.16 98.133333 0l142.506667 153.173334c4.010667 4.266667 10.325333 4.266667 13.909333 0l102.826667-110.506667c36.565333-39.253333 65.962667-34.133333 80.213333-28.16 14.336 6.4 38.144 25.173333 38.144 81.066667v409.173333c0.426667 146.346667-91.306667 244.906667-227.925333 244.906667zM157.952 223.573333c-1.194667 3.413333-2.389333 9.813333-2.389333 20.053334v409.173333c0 99.84 75.861333 181.333333 168.746666 181.333333h397.098667c102.442667 0 168.746667-71.253333 168.746667-181.333333V243.626667c0-10.24-1.194667-16.213333-2.389334-19.626667-3.157333 1.706667-7.936 5.12-14.677333 12.373333l-102.826667 110.506667c-26.24 28.16-72.277333 28.16-98.133333 0l-142.506667-153.173333c-3.968-4.266667-10.325333-4.266667-13.909333 0L373.546667 346.453333c-26.197333 28.16-72.234667 28.16-98.048 0l-102.826667-110.506666c-6.784-7.253333-11.946667-10.666667-14.72-12.373334z" />
  </svg>
);

const InboxIcon = ({ size = 22, style = {}, ...rest }) => (
  <svg viewBox="0 0 1024 1024" width={size} height={size} fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={style} {...rest}>
    <path d="M915.437568 193.220608h-766.6176c-15.39072 0-27.91424 12.521472-27.91424 27.913216v546.797568c0 15.39072 12.52352 27.911168 27.91424 27.911168h766.6176c15.392768 0 27.91424-12.521472 27.91424-27.911168V221.1328c0.001024-15.391744-12.521472-27.913216-27.91424-27.913216z m-5.202944 458.215424L694.182912 480.618496c72.22272-62.94016 170.19904-148.3264 216.051712-188.288v359.105536z m0-425.099264v22.065152c-35.376128 30.830592-300.504064 261.895168-323.352576 281.786368-23.129088 20.150272-45.995008 22.326272-54.754304 22.326272s-31.625216-2.177024-54.759424-22.330368c-22.841344-19.88608-287.962112-250.944512-323.344384-281.781248v-22.066176h756.210688zM372.302848 482.56L154.023936 655.15008V292.332544a9183373.81376 9183373.81376 0 0 0 218.278912 190.22848z m-218.278912 280.1664v-65.3568l243.680256-192.673792c30.019584 26.160128 52.023296 45.33248 57.914368 50.460672 31.568896 27.505664 64.023552 30.475264 76.510208 30.475264 12.48768 0 44.941312-2.9696 76.505088-30.471168 6.037504-5.255168 28.992512-25.25696 60.14976-52.407296l241.451008 190.900224v69.072896H154.023936z" />
  </svg>
);

const IconEntryButton = ({ label, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    style={iconEntryButtonStyle}
  >
    {children}
  </button>
);

const compactCardButtonStyle = {
  width: '100%',
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 244, 238, 0.96))',
  padding: '14px 16px',
  borderRadius: '18px',
  boxShadow: 'var(--shadow-sm)',
  cursor: 'pointer',
  textAlign: 'left',
  border: '1px solid rgba(214, 140, 101, 0.12)',
  minHeight: '96px'
};

const compactCardMetaTextStyle = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#5b6472',
  flexShrink: 0
};

const statusCardHeaderTextStyle = {
  fontSize: '11px',
  fontWeight: 700,
  color: '#7c6855',
  letterSpacing: '0.04em',
  textTransform: 'uppercase'
};

const iconEntryButtonStyle = {
  width: '44px',
  height: '44px',
  borderRadius: '14px',
  border: '1px solid rgba(15, 23, 42, 0.08)',
  backgroundColor: 'rgba(255, 255, 255, 0.88)',
  color: '#334155',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: 'var(--shadow-sm)',
  flexShrink: 0
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

const ShopDoorIcon = ({ size = 22, style = {}, ...rest }) => (
  <svg viewBox="0 0 1024 1024" width={size} height={size} fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={style} {...rest}>
    <path d="M889.583614 155.560962c-1.786693-7.514137-2.490727-11.777231-4.848424-15.61463l-0.001024-0.002046h-0.001023c-4.973268-7.223518-13.295817-11.962449-22.728654-11.96245h-700.596356c-9.432837 0-17.756409 4.738931-22.728654 11.96245h-0.001023l-0.001023 0.002046c-2.358721 3.837398-3.061732 8.100492-4.848425 15.61463-1.786693 7.514137-69.845765 292.554032-69.845765 292.554032v7.653307c0 46.38954 26.00835 86.708827 63.960731 106.651019v301.108872c0 17.662265 14.3181 31.980365 31.980365 31.980365h703.567014c17.662265 0 31.980365-14.3181 31.980365-31.980365V562.41932c37.95238-19.942191 63.960731-60.261479 63.960731-106.651019v-7.653307c-0.002047 0-68.062142-285.039895-69.848835-292.554032zM383.78485 831.54885V703.627389h255.842922v127.921461H383.78485z m319.80263-159.901827c0-17.662265-14.3181-31.980365-31.980366-31.980365H351.804485c-17.662265 0-31.980365 14.3181-31.980366 31.980365v159.901827H191.902658v-256.287038c28.062126-2.434445 53.350069-14.914688 72.362075-33.897017 21.267373 21.233604 50.384527 34.342156 82.45699 34.342156 32.072463 0 61.189617-13.107529 82.458013-34.342156 21.055548 21.022803 49.807383 34.072003 81.502246 34.329876v0.011256l0.068561 0.001024c0.148379 0 0.294712-0.005117 0.443092-0.005117 0.147356 0.001023 0.294712 0.005117 0.442068 0.005117l0.068562-0.001024v-0.011256c31.715329-0.257873 61.470003-13.30605 82.525551-34.329876 21.268396 21.233604 50.384527 34.342156 82.458014 34.342156 32.072463 0 61.189617-13.107529 82.45699-34.342156 19.012006 18.98233 44.299949 31.461549 72.362074 33.897017v256.287038H703.58748v-159.901827z m132.265396-159.911036c-29.943986 0-54.220902-24.536836-54.220902-54.801117 0-15.131629-12.108782-27.370371-27.080776-27.370371-14.971993 0-27.080775 12.238742-27.080775 27.370371 0 30.264281-24.276916 54.801117-54.220902 54.801117-29.943986 0-54.220902-24.536836-54.220902-54.801117 0-15.131629-12.108782-27.370371-27.080776-27.370371-14.971993 0-27.080775 12.238742-27.080775 27.370371 0 30.264281-24.276916 54.801117-54.220902 54.801117-29.943986 0-54.220902-24.536836-54.220902-54.801117 0-15.131629-12.108782-27.370371-27.080776-27.370371-14.971993 0-27.080775 12.238742-27.080775 27.370371 0 30.264281-24.276916 54.801117-54.220902 54.801117s-57.494459-33.68724-57.494459-63.951521l62.50559-255.842922h640.513955l64.508199 255.842922c-0.00307 30.264281-29.67588 63.951521-59.619865 63.951521z" />
  </svg>
);

const BadgeMeaningIcon = ({ size = 18, style = {}, ...rest }) => (
  <svg viewBox="0 0 1024 1024" width={size} height={size} fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={style} {...rest}>
    <path d="M839.68 293.546667a187.733333 187.733333 0 0 0-141.226667-13.653334 186.453333 186.453333 0 0 0-372.48 0 191.146667 191.146667 0 0 0-141.226666 12.373334 186.453333 186.453333 0 0 0 26.026666 341.333333 187.733333 187.733333 0 0 0-34.133333 106.666667 213.333333 213.333333 0 0 0 2.986667 32 185.173333 185.173333 0 0 0 183.04 154.88 199.68 199.68 0 0 0 27.306666 0A188.586667 188.586667 0 0 0 512 853.333333a188.586667 188.586667 0 0 0 122.026667 72.106667 199.68 199.68 0 0 0 27.306666 0 186.026667 186.026667 0 0 0 151.893334-293.12 186.026667 186.026667 0 0 0 26.453333-341.333333z m-398.506667-82.773334a102.4 102.4 0 0 1 141.653334 0 103.68 103.68 0 0 1 22.186666 113.493334l-11.093333 25.173333-28.16 24.746667A173.653333 173.653333 0 0 0 512 364.8a170.666667 170.666667 0 0 0-68.693333 14.506667L419.413333 324.266667a101.973333 101.973333 0 0 1 21.76-113.493334z m-260.266666 291.84A101.12 101.12 0 0 1 338.773333 384l20.906667 18.346667 14.933333 34.133333A167.253333 167.253333 0 0 0 341.333333 535.466667 121.6 121.6 0 0 0 341.333333 554.666667h-23.466666l-35.84 3.413333a101.12 101.12 0 0 1-101.12-55.466667z m281.6 259.413334a101.546667 101.546667 0 0 1-198.826667-3.413334 130.986667 130.986667 0 0 1 0-17.92 99.413333 99.413333 0 0 1 49.92-85.333333l21.76-15.36 38.826667-4.266667a170.666667 170.666667 0 0 0 101.546666 66.986667zM512 620.8a85.333333 85.333333 0 1 1 85.333333-85.333333 85.333333 85.333333 0 0 1-85.333333 85.333333z m248.32 137.386667a100.693333 100.693333 0 0 1-114.346667 82.773333 101.973333 101.973333 0 0 1-85.333333-78.933333l-5.973333-25.6 8.96-39.253334a170.666667 170.666667 0 0 0 93.866666-75.093333l21.333334 12.8H682.666667l28.16 16.64a101.546667 101.546667 0 0 1 49.493333 106.666667z m82.773333-256a101.973333 101.973333 0 0 1-90.88 56.746666h-10.24l-27.306666-4.266666-32-17.493334a170.666667 170.666667 0 0 0-42.666667-112.64l18.346667-15.786666 26.88-24.746667a101.12 101.12 0 0 1 157.866666 120.32z" />
  </svg>
);

const WealthCardIcon = ({ size = 18, style = {}, ...rest }) => (
  <svg viewBox="0 0 2048 1024" width={size} height={size} fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={style} {...rest}>
    <path d="M1239.312383 307.3734c-12.784647-6.39413-14.916023-21.317378-6.397742-31.977873 6.397742-8.529119 12.795484-17.051012 17.058237-25.580132 40.496155-70.346264 38.364778-151.349411-8.525506-176.925929-10.660495-6.39413-21.313766-8.525506-34.105638-8.525506-12.795484 0-23.448755 2.131377-36.240626 8.525506-2.131377 2.134989-6.39413 2.134989-8.525507 2.134989-6.390517 0-12.784647-2.134989-17.051012-8.525506C1117.809469 28.126946 1073.046948 2.546814 1021.890298 2.546814c-51.160262 0-95.922783 25.580131-123.637903 63.952135-4.262753 6.39413-10.660495 8.525506-17.051012 8.525506-2.131377 0-6.397742 0-8.529119-2.134989-10.65327-8.525506-23.445142-10.660495-34.102025-10.660495-12.795484 0-23.448755 2.134989-34.10925 8.529118-44.766133 25.580131-49.028886 106.579666-8.529119 176.922317 6.397742 8.529119 10.660495 19.186002 17.054625 25.580132 8.525506 10.660495 6.39413 25.580131-6.397742 31.977873-149.210809 78.868158-251.531334 236.608086-251.531334 417.793156 0 91.663642 29.846497 176.933155 78.87177 247.275806 23.448755 31.974261 61.817145 51.153037 102.316913 51.153038h575.540309c40.499767 0 78.868158-19.182389 102.3133-51.153038 49.032498-70.346264 78.875383-155.612164 78.875382-247.275806 0-181.181458-102.320525-338.921386-253.66271-415.658167z m140.688915 637.353842c-14.923248 21.320991-40.50338 34.105637-68.214887 34.105637H736.246102c-27.711508 0-53.291639-12.784647-68.211275-34.105637-44.766133-63.944909-70.342652-140.685303-70.342652-221.692062 0-159.871305 87.393664-304.815748 230.217569-379.428378 17.051012-8.529119 27.711508-23.448755 31.977873-42.627532 4.259141-19.186002 0-38.368391-12.795484-53.295251-4.262753-6.390517-10.65327-14.916023-14.916023-21.317378-14.919636-27.707895-21.317378-57.55078-21.317379-80.995922 0-19.186002 6.397742-31.977873 14.919636-36.240627 4.266366-4.259141 8.529119-4.259141 12.795485-4.25914 6.390517 0 12.788259 2.127764 21.317378 4.25914 8.521894 4.266366 17.051012 4.266366 25.580131 4.266366 21.317378 0 40.499767-10.656883 53.288027-27.711508 17.051012-27.707895 51.160262-44.766133 85.262287-44.766133 34.10925 0 68.214887 17.058237 87.404502 46.89751 12.788259 17.058237 31.974261 27.711508 53.288026 27.711508 8.525506 0 17.058237-2.131377 25.576519-4.266366 8.529119-2.127764 14.930473-4.259141 21.317378-4.259141 4.266366 0 8.525506 0 12.795484 2.131377 19.182389 10.664108 25.576519 61.817145-6.397742 119.371537-4.266366 8.525506-8.525506 14.919636-14.919636 21.317378-12.795484 14.923248-17.058237 34.105637-12.795484 53.288027 4.262753 19.186002 14.930473 34.105637 31.981486 42.634756 140.685303 72.477641 228.086192 217.422084 228.086192 377.293389-0.01445 81.003147-25.598194 157.743541-70.357102 221.68845zM1024.010838 445.927327c0 117.236548-95.91917 213.162944-213.159332 213.162943 117.240161 0 213.159331 95.926395 213.159332 213.166556 0-117.240161 95.926395-213.166556 213.166556-213.166556-117.236548 0-213.166556-95.926395-213.166556-213.162943z m0 285.640584c-19.186002-27.718733-42.631144-53.295252-72.470416-72.477641 27.707895-19.186002 53.284414-42.631144 72.470416-72.47764 19.193227 27.718733 42.638369 53.295252 72.481253 72.47764-29.839272 19.182389-53.288027 42.631144-72.481253 72.477641z" />
  </svg>
);

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
                  background: 'var(--theme-button-primary-bg)',
                  color: 'var(--theme-button-primary-text)',
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
                  background: codeRequested ? 'var(--theme-button-primary-bg)' : '#cbd5e1',
                  color: codeRequested ? 'var(--theme-button-primary-text)' : '#fff',
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
  const [membershipSettings, setMembershipSettings] = useState(null);
  const [loadingMembershipSettings, setLoadingMembershipSettings] = useState(false);
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);
  const [selectedMembershipPlanKey, setSelectedMembershipPlanKey] = useState('');
  const [submittingMembershipOrder, setSubmittingMembershipOrder] = useState(false);
  const [showDebugCard, setShowDebugCard] = useState(DEFAULT_CLIENT_THEME_SETTINGS.showDebugCard);

  const recentEntries = useMemo(() => history.slice(0, 5), [history]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const nextSettings = await themeSettingsService.getSettings();
        if (!cancelled) {
          setShowDebugCard(Boolean(nextSettings.showDebugCard ?? DEFAULT_CLIENT_THEME_SETTINGS.showDebugCard));
        }
      } catch {
        if (!cancelled) {
          setShowDebugCard(DEFAULT_CLIENT_THEME_SETTINGS.showDebugCard);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleOpenMembershipEntry = () => {
    setErrorMessage('');
    setFeedbackMessage('');

    if (!authStatus.isAuthenticated) {
      setIsLoginModalOpen(true);
      setFeedbackMessage('登录后即可创建学员付费订单。');
      return;
    }

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

  const boundPhoneNumber = currentUser?.phone || authStatus.phoneNumber || '';
  const hasBoundPhone = Boolean(String(boundPhoneNumber || '').trim());
  const inviteCode = currentUser?.inviteCode || '';
  const debugEmail = currentUser?.email || authStatus.email || '';

  return (
    <div style={{ padding: '20px', paddingBottom: '80px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
        <button
          type="button"
          onClick={() => navigate('/album')}
          style={compactCardButtonStyle}
        >
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <BookOpen size={17} color="var(--color-accent-clay)" />
              <span style={statusCardHeaderTextStyle}>花开纪念册</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', minWidth: 0 }}>
              <span style={compactCardMetaTextStyle}>
                {equippedBadge ? '已佩戴' : '待佩戴'}
              </span>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: '#111827',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {equippedBadge?.displayName || equippedBadge?.name || '选择一枚徽章'}
              </span>
              <BadgeMeaningIcon size={16} style={{ color: 'var(--color-accent-clay)', flexShrink: 0 }} aria-label="徽章" />
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/fortune-ledger')}
          style={compactCardButtonStyle}
        >
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <WealthCardIcon size={17} color="var(--color-accent-clay)" />
              <span style={statusCardHeaderTextStyle}>福豆</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', minWidth: 0 }}>
              <span style={compactCardMetaTextStyle}>当前状态</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{balance}</span>
              <FortuneBeanIcon size={16} style={{ color: 'var(--color-accent-clay)', flexShrink: 0 }} aria-label="福豆" />
            </div>
          </div>
        </button>
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <button
              type="button"
              onClick={() => navigate('/profile/info')}
              aria-label="个人信息"
              title="个人信息"
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-bg-secondary)',
                marginRight: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                padding: 0,
                overflow: 'hidden',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {currentUser?.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt="用户头像"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
              ) : (
                <UserRound size={28} color="var(--color-accent-ink)" />
              )}
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '20px', margin: 0, fontFamily: 'var(--font-serif)' }}>
                  {getDisplayName(authStatus, currentUser)}
                </h2>
                <button
                  type="button"
                  onClick={handleOpenMembershipEntry}
                  aria-label={currentUser?.isStudent ? '续费学员' : '付费学员'}
                  title={currentUser?.isStudent ? '续费学员' : '付费学员'}
                  style={{
                    ...inlineNameIconButtonStyle,
                    width: '32px',
                    height: '32px',
                    color: currentUser?.isStudent ? '#b45309' : '#8b5e34',
                    backgroundColor: currentUser?.isStudent ? 'rgba(217, 119, 6, 0.12)' : 'rgba(214, 140, 101, 0.12)'
                  }}
                >
                  <MembershipIcon size={16} />
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '12px',
                    color: hasBoundPhone ? '#0f766e' : '#94a3b8',
                    backgroundColor: hasBoundPhone ? 'rgba(15, 118, 110, 0.12)' : 'rgba(148, 163, 184, 0.16)',
                    padding: '4px 8px',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  aria-label={hasBoundPhone ? '已绑定手机号' : '未绑定手机号'}
                  title={hasBoundPhone ? '已绑定手机号' : '未绑定手机号'}
                >
                  <Smartphone size={14} />
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
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <IconEntryButton
              label="工坊入口"
              onClick={() => navigate('/s')}
            >
              <ShopDoorIcon size={24} />
            </IconEntryButton>
            <IconEntryButton
              label="站内信"
              onClick={() => setFeedbackMessage('站内信入口已预留，内容后续补充。')}
            >
              <InboxIcon size={20} />
            </IconEntryButton>
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
                background: 'var(--theme-button-primary-bg)',
                color: 'var(--theme-button-primary-text)',
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

      {showDebugCard && (
        <section
          style={{
            backgroundColor: '#fff',
            borderRadius: '14px',
            padding: '16px',
            boxShadow: 'var(--shadow-sm)',
            marginTop: '24px'
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
            调试
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
            登录方式：{getLoginMethodLabel(authStatus.loginMethod)}<br />
            手机号：{boundPhoneNumber || '未绑定'}<br />
            邀请码：{inviteCode || '生成中'}<br />
            {debugEmail ? `邮箱：${debugEmail}` : '邮箱：未绑定'}
          </div>
        </section>
      )}
    </div>
  );
};

export default Profile;
