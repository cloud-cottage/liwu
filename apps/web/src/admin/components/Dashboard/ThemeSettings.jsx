import React, { useEffect, useMemo, useState } from 'react';
import { THEME_PRESETS, getThemePreset } from '@liwu/shared-utils/theme-system.js';
import { uploadImageAsWebp } from '../../utils/imageUpload.js';
import BadgeSettings from './BadgeSettings.jsx';
import MeditationSettings from './MeditationSettings.jsx';

const ThemeSettings = ({
  settings,
  awarenessDisplaySettings,
  brandCarouselSettings,
  userAvatarOptionsSettings,
  clientDistributionSettings,
  pageMastheadSettings,
  meditationSettings,
  badgeSettings,
  shopPartnerPricingSettings,
  error,
  saving,
  savingAwarenessDisplay,
  savingCarousel,
  savingAvatarOptions,
  savingClientDistribution,
  savingPageMasthead,
  savingMeditationSettings,
  savingBadgeSettings,
  savingShopPartnerPricing,
  onSave,
  onSaveAwarenessDisplay,
  onSaveBrandCarousel,
  onSaveUserAvatarOptions,
  onSaveClientDistribution,
  onSavePageMasthead,
  onSaveMeditationSettings,
  onSaveBadgeSettings
  ,
  onSaveShopPartnerPricing
}) => {
  const [activeTab, setActiveTab] = useState('home');
  const [draftTheme, setDraftTheme] = useState(settings.theme);
  const [draftShowDebugCard, setDraftShowDebugCard] = useState(Boolean(settings.showDebugCard));
  const [draftPopularTagCount, setDraftPopularTagCount] = useState(Number(awarenessDisplaySettings.popularTagCount || 33));
  const [draftHomeSlogan, setDraftHomeSlogan] = useState(pageMastheadSettings.homeSlogan || '');
  const [draftAwarenessSlogan, setDraftAwarenessSlogan] = useState(pageMastheadSettings.awarenessSlogan || '');
  const [draftShopSlogan, setDraftShopSlogan] = useState(pageMastheadSettings.shopSlogan || '');
  const [draftMeditationSlogan, setDraftMeditationSlogan] = useState(pageMastheadSettings.meditationSlogan || '');
  const [draftShopPartnerPricingTiers, setDraftShopPartnerPricingTiers] = useState(() => shopPartnerPricingSettings.tiers || []);
  const [draftSlides, setDraftSlides] = useState(() => brandCarouselSettings.slides || []);
  const [draftAvatarOptions, setDraftAvatarOptions] = useState(() => userAvatarOptionsSettings.avatars || []);
  const [draftPreviewUrl, setDraftPreviewUrl] = useState(clientDistributionSettings.previewUrl || '');
  const [draftAndroidApkUrl, setDraftAndroidApkUrl] = useState(clientDistributionSettings.androidApkUrl || '');
  const [draftIosDistributionUrl, setDraftIosDistributionUrl] = useState(clientDistributionSettings.iosDistributionUrl || '');
  const [localBuildStatus, setLocalBuildStatus] = useState({
    building: false,
    lastBuiltAt: '',
    lastError: '',
    lastLog: '',
    apkUrl: '/client-builds/liwu-app-debug.apk',
    apkExists: false
  });
  const [localBuildMessage, setLocalBuildMessage] = useState('');
  const [uploadingSlideIndex, setUploadingSlideIndex] = useState(-1);
  const [uploadingAvatarIndex, setUploadingAvatarIndex] = useState(-1);
  const [carouselFeedback, setCarouselFeedback] = useState('');
  const [avatarFeedback, setAvatarFeedback] = useState('');
  const themeOptions = useMemo(() => Object.values(THEME_PRESETS), []);
  const activeTheme = getThemePreset(draftTheme);
  const derivedPreviewUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const currentUrl = new URL(window.location.href);

    if (currentUrl.pathname.startsWith('/admin') && currentUrl.port === '5173') {
      currentUrl.port = '5174';
      currentUrl.pathname = '/';
      currentUrl.search = '';
      currentUrl.hash = '';
      return currentUrl.toString();
    }

    if (currentUrl.pathname.startsWith('/admin') && currentUrl.port === '5174') {
      currentUrl.port = '5173';
      currentUrl.pathname = '/';
      currentUrl.search = '';
      currentUrl.hash = '';
      return currentUrl.toString();
    }

    currentUrl.pathname = currentUrl.pathname.replace(/\/admin\/?$/, '/') || '/';
    currentUrl.search = '';
    currentUrl.hash = '';
    return currentUrl.toString();
  }, []);
  const resolvedPreviewUrl = String(draftPreviewUrl || '').trim() || derivedPreviewUrl;
  const derivedAndroidApkUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    const currentUrl = new URL(window.location.href);
    currentUrl.search = '';
    currentUrl.hash = '';

    if (currentUrl.port === '5174') {
      currentUrl.pathname = '/client-builds/liwu-app-debug.apk';
      return currentUrl.toString();
    }

    currentUrl.pathname = '/client-builds/liwu-app-debug.apk';
    return currentUrl.toString();
  }, []);
  const resolvedAndroidApkUrl = String(draftAndroidApkUrl || '').trim() || derivedAndroidApkUrl;
  const isLocalAdmin = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
  }, []);

  useEffect(() => {
    setDraftTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    setDraftShowDebugCard(Boolean(settings.showDebugCard));
  }, [settings.showDebugCard]);

  useEffect(() => {
    setDraftPopularTagCount(Number(awarenessDisplaySettings.popularTagCount || 33));
  }, [awarenessDisplaySettings.popularTagCount]);

  useEffect(() => {
    setDraftHomeSlogan(pageMastheadSettings.homeSlogan || '');
    setDraftAwarenessSlogan(pageMastheadSettings.awarenessSlogan || '');
    setDraftShopSlogan(pageMastheadSettings.shopSlogan || '');
    setDraftMeditationSlogan(pageMastheadSettings.meditationSlogan || '');
  }, [
    pageMastheadSettings.homeSlogan,
    pageMastheadSettings.awarenessSlogan,
    pageMastheadSettings.shopSlogan,
    pageMastheadSettings.meditationSlogan
  ]);

  useEffect(() => {
    setDraftSlides(brandCarouselSettings.slides || []);
  }, [brandCarouselSettings.slides]);

  useEffect(() => {
    setDraftAvatarOptions(userAvatarOptionsSettings.avatars || []);
  }, [userAvatarOptionsSettings.avatars]);

  useEffect(() => {
    setDraftShopPartnerPricingTiers(shopPartnerPricingSettings.tiers || []);
  }, [shopPartnerPricingSettings.tiers]);

  useEffect(() => {
    setDraftPreviewUrl(clientDistributionSettings.previewUrl || '');
    setDraftAndroidApkUrl(clientDistributionSettings.androidApkUrl || '');
    setDraftIosDistributionUrl(clientDistributionSettings.iosDistributionUrl || '');
  }, [
    clientDistributionSettings.androidApkUrl,
    clientDistributionSettings.iosDistributionUrl,
    clientDistributionSettings.previewUrl
  ]);

  useEffect(() => {
    if (activeTab !== 'distribution' || !isLocalAdmin) {
      return undefined;
    }

    let cancelled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch('/api/local-client-build/status');
        const payload = await response.json();
        if (!cancelled && payload?.success) {
          setLocalBuildStatus(payload.data);
        }
      } catch (error) {
        if (!cancelled) {
          setLocalBuildMessage(error.message || '本地构建状态读取失败');
        }
      }
    };

    void loadStatus();
    const timerId = window.setInterval(() => {
      void loadStatus();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [activeTab, isLocalAdmin]);

  const handleTriggerLocalAndroidBuild = async () => {
    setLocalBuildMessage('');

    try {
      const response = await fetch('/api/local-client-build/android', {
        method: 'POST'
      });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Android APK 重打失败');
      }

      setLocalBuildMessage(payload.message || '已开始重打 Android APK。');
      setLocalBuildStatus((currentStatus) => ({
        ...currentStatus,
        building: true,
        lastError: ''
      }));
    } catch (error) {
      setLocalBuildMessage(error.message || 'Android APK 重打失败');
    }
  };

  const handleSlideCaptionChange = (index, value) => {
    setDraftSlides((currentSlides) => currentSlides.map((slide, slideIndex) => (
      slideIndex === index ? { ...slide, caption: value } : slide
    )));
  };

  const handleUploadSlideImage = async (index, file) => {
    if (!file) {
      return;
    }

    setUploadingSlideIndex(index);
    setCarouselFeedback('');

    try {
      const uploadResult = await uploadImageAsWebp({
        file,
        cloudPath: `liwu/brand-carousel/${draftSlides[index].id}-${Date.now()}.webp`,
      });

      setDraftSlides((currentSlides) => currentSlides.map((slide, slideIndex) => (
        slideIndex === index
          ? {
            ...slide,
            fileId: uploadResult.fileId,
            imageUrl: uploadResult.imageUrl
          }
          : slide
      )));
      setCarouselFeedback(`第 ${index + 1} 张轮播图已转换为 webP 并上传成功，记得点击“保存轮播图设置”。`);
    } catch (error) {
      console.error('品牌轮播图上传失败:', error);
      setCarouselFeedback(error.message || '品牌轮播图上传失败');
    } finally {
      setUploadingSlideIndex(-1);
    }
  };

  const handleUploadAvatarImage = async (index, file) => {
    if (!file) {
      return;
    }

    setUploadingAvatarIndex(index);
    setAvatarFeedback('');

    try {
      const slot = draftAvatarOptions[index];
      const uploadResult = await uploadImageAsWebp({
        file,
        cloudPath: `liwu/user-avatar-options/${slot.id}-${Date.now()}.webp`
      });

      setDraftAvatarOptions((currentOptions) => currentOptions.map((avatar, avatarIndex) => (
        avatarIndex === index
          ? {
            ...avatar,
            fileId: uploadResult.fileId,
            imageUrl: uploadResult.imageUrl
          }
          : avatar
      )));
      setAvatarFeedback(`头像槽位 ${index + 1} 已上传成功，记得点击“保存头像设置”。`);
    } catch (uploadError) {
      console.error('用户头像上传失败:', uploadError);
      setAvatarFeedback(uploadError.message || '用户头像上传失败');
    } finally {
      setUploadingAvatarIndex(-1);
    }
  };

  const normalizeSloganInput = (value = '') => String(value || '').slice(0, 60);

  const draftPageMastheadPayload = {
    ...pageMastheadSettings,
    homeSlogan: normalizeSloganInput(draftHomeSlogan),
    awarenessSlogan: normalizeSloganInput(draftAwarenessSlogan),
    shopSlogan: normalizeSloganInput(draftShopSlogan),
    meditationSlogan: normalizeSloganInput(draftMeditationSlogan)
  };

  const handleSaveHomeSettings = async () => {
    await onSave({ ...settings, theme: draftTheme, showDebugCard: draftShowDebugCard });
    await onSavePageMasthead(draftPageMastheadPayload);
  };

  const handleSaveAwarenessSettings = async () => {
    await onSaveAwarenessDisplay({ ...awarenessDisplaySettings, popularTagCount: draftPopularTagCount });
    await onSavePageMasthead(draftPageMastheadPayload);
  };

  const handleSaveShopSettings = async () => {
    await onSavePageMasthead(draftPageMastheadPayload);
    await onSaveShopPartnerPricing({ ...shopPartnerPricingSettings, tiers: draftShopPartnerPricingTiers });
  };

  const handleSaveMeditationSettings = async () => {
    await onSavePageMasthead(draftPageMastheadPayload);
  };

  return (
    <section
      style={{
        backgroundColor: '#fff',
        borderRadius: '20px',
        boxShadow: 'var(--shadow-sm)',
        padding: '24px'
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>设置</h2>
        <div style={{ fontSize: '14px', color: '#666', lineHeight: 1.7 }}>
          统一控制 app、web 和小程序三端同步使用的 PageMasthead、主题与入口配置。
        </div>
      </div>

      {error && (
        <div style={errorBannerStyle}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { key: 'home', label: '首页' },
          { key: 'shop', label: '工坊' },
          { key: 'meditation', label: '冥想' },
          { key: 'awareness', label: '觉察' },
          { key: 'avatar', label: '我的' },
          { key: 'distribution', label: '版本' }
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveTab(item.key)}
            style={{
              border: 'none',
              borderRadius: '999px',
              backgroundColor: activeTab === item.key ? '#111827' : '#fff',
              color: activeTab === item.key ? '#fff' : '#334155',
              boxShadow: 'var(--shadow-sm)',
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeTab === 'home' && (
      <div style={{ display: 'grid', gap: '16px' }}>
        <div style={previewCardStyle}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            page_masthead
          </div>
          <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
            首页 PageMasthead
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
            `PageMasthead` 指的是页眉处的三行组合：英文标签、页面标题、slogan 文案。
          </div>
          <label style={{ ...fieldStyle, marginTop: '18px' }}>
            <span style={fieldLabelStyle}>首页 slogan</span>
            <input
              type="text"
              maxLength="60"
              value={draftHomeSlogan}
              onChange={(event) => setDraftHomeSlogan(normalizeSloganInput(event.target.value))}
              style={fieldInputStyle}
            />
            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
              不超过 60 字符，纯文字。当前 {draftHomeSlogan.length}/60
            </div>
          </label>
        </div>

        <label style={fieldStyle}>
          <span style={fieldLabelStyle}>当前主题</span>
          <select
            value={draftTheme}
            onChange={(event) => setDraftTheme(event.target.value)}
            style={fieldInputStyle}
          >
            {themeOptions.map((theme) => (
              <option key={theme.name} value={theme.name}>{theme.label}</option>
            ))}
          </select>
        </label>

        <div style={previewCardStyle}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            theme_preview
          </div>
          <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
            {activeTheme.label}
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
            {activeTheme.description}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
            <div
              style={{
                ...previewSwatchStyle,
                background: activeTheme.web['--theme-button-primary-bg'],
                color: activeTheme.web['--theme-button-primary-text']
              }}
            >
              主按钮
            </div>
            <div
              style={{
                ...previewSwatchStyle,
                background: activeTheme.web['--color-bg-secondary'],
                color: activeTheme.web['--color-text-primary'],
                border: `1px solid ${activeTheme.web['--color-border']}`
              }}
            >
              卡片背景
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            {[
              activeTheme.web['--color-bg-primary'],
              activeTheme.web['--color-accent-clay'],
              activeTheme.web['--color-success'],
              activeTheme.web['--color-accent-ink']
            ].map((colorValue) => (
              <span
                key={colorValue}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: colorValue,
                  boxShadow: '0 8px 18px rgba(15, 23, 42, 0.12)'
                }}
              />
            ))}
          </div>
        </div>

        <div style={previewCardStyle}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            brand_carousel
          </div>
          <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
            品牌轮播图
          </div>
          <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
            维护首页轮播的四张品牌图片与对应文案。图片会上传到 CloudBase 云存储。
          </div>

          {carouselFeedback && (
            <div style={{ marginTop: '14px', ...successBannerStyle }}>
              {carouselFeedback}
            </div>
          )}

          <div style={{ display: 'grid', gap: '14px', marginTop: '18px' }}>
            {draftSlides.map((slide, index) => (
              <div key={slide.id} style={carouselSlideCardStyle}>
                <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '14px', alignItems: 'start' }}>
                  <div>
                    <div style={carouselPreviewFrameStyle}>
                      {slide.imageUrl ? (
                        <img src={slide.imageUrl} alt={slide.id} style={carouselPreviewImageStyle} />
                      ) : (
                        <div style={carouselPreviewPlaceholderStyle}>未上传</div>
                      )}
                    </div>
                    <label style={uploadButtonStyle}>
                      {uploadingSlideIndex === index ? '上传中...' : '上传图片'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingSlideIndex === index}
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          void handleUploadSlideImage(index, file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  <label style={fieldStyle}>
                    <span style={fieldLabelStyle}>图片文案</span>
                    <textarea
                      rows={3}
                      value={slide.caption}
                      onChange={(event) => handleSlideCaptionChange(index, event.target.value)}
                      style={{ ...fieldInputStyle, resize: 'vertical', minHeight: '88px' }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
            <button
              type="button"
              onClick={() => onSaveBrandCarousel({ ...brandCarouselSettings, slides: draftSlides })}
              disabled={savingCarousel}
              style={primaryButtonStyle}
            >
              {savingCarousel ? '保存中...' : '保存轮播图设置'}
            </button>
          </div>
        </div>

      </div>
      )}

      {activeTab === 'avatar' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={previewCardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              profile_debug
            </div>
            <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              调试卡片
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
              控制【我的】页面中的调试卡片显示与否，便于后续统一隐藏。
            </div>

            <label
              style={{
                marginTop: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '14px 16px',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>显示调试卡片</div>
                <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                  开启后，【我的】页面会显示登录方式与邮箱信息卡片。
                </div>
              </div>
              <input
                type="checkbox"
                checked={draftShowDebugCard}
                onChange={(event) => setDraftShowDebugCard(event.target.checked)}
                style={{ width: '18px', height: '18px', flexShrink: 0 }}
              />
            </label>
          </div>

          <div style={previewCardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              user_avatar_options
            </div>
            <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              用户头像
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
              上传并维护 48 张 1:1 头像图片。用户只能从这 48 张头像中选择一张；新用户默认会从编号 1-6 的头像中随机获得一张。
            </div>

            {avatarFeedback && (
              <div style={{ marginTop: '14px', ...(avatarFeedback.includes('失败') ? errorBannerStyle : successBannerStyle) }}>
                {avatarFeedback}
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
                gap: '14px',
                marginTop: '18px'
              }}
            >
              {draftAvatarOptions.map((avatar, index) => (
                <div
                  key={avatar.id}
                  style={{
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#fff',
                    padding: '12px',
                    display: 'grid',
                    gap: '10px'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textAlign: 'center' }}>
                    #{avatar.index}
                  </div>
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {avatar.imageUrl ? (
                      <img
                        src={avatar.imageUrl}
                        alt={avatar.id}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                        未上传
                      </div>
                    )}
                  </div>
                  <label style={{ ...uploadButtonStyle, width: '100%', justifyContent: 'center' }}>
                    {uploadingAvatarIndex === index ? '上传中...' : (avatar.imageUrl ? '替换图片' : '上传图片')}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingAvatarIndex === index}
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        void handleUploadAvatarImage(index, file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <BadgeSettings
            key={`${badgeSettings.documentId || 'default'}-${badgeSettings.version || 1}`}
            settings={badgeSettings}
            error={error}
            saving={savingBadgeSettings}
            onSave={onSaveBadgeSettings}
          />
        </div>
      )}

      {activeTab === 'awareness' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={previewCardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              awareness_display
            </div>
            <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              觉察
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
              设置【觉察】页面词云中最多显示多少个标签。该参数会影响同心照亮词云聚合区。
            </div>

            <label style={{ ...fieldStyle, marginTop: '18px' }}>
              <span style={fieldLabelStyle}>觉察 slogan</span>
              <input
                type="text"
                maxLength="60"
                value={draftAwarenessSlogan}
                onChange={(event) => setDraftAwarenessSlogan(normalizeSloganInput(event.target.value))}
                style={fieldInputStyle}
              />
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                不超过 60 字符，纯文字。当前 {draftAwarenessSlogan.length}/60
              </div>
            </label>

            <label style={{ ...fieldStyle, marginTop: '18px', maxWidth: '280px' }}>
              <span style={fieldLabelStyle}>词云显示数量</span>
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                value={draftPopularTagCount}
                onChange={(event) => setDraftPopularTagCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))}
                style={fieldInputStyle}
              />
            </label>

            <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
              默认值为 33。你可以根据词云密度在 1-200 之间调整。
            </div>
          </div>
        </div>
      )}

      {activeTab === 'shop' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={previewCardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              page_masthead
            </div>
            <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              工坊 PageMasthead
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
              设置【工坊】页面页眉的 slogan 文案。
            </div>
            <label style={{ ...fieldStyle, marginTop: '18px' }}>
              <span style={fieldLabelStyle}>工坊 slogan</span>
              <input
                type="text"
                maxLength="60"
                value={draftShopSlogan}
                onChange={(event) => setDraftShopSlogan(normalizeSloganInput(event.target.value))}
                style={fieldInputStyle}
              />
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                不超过 60 字符，纯文字。当前 {draftShopSlogan.length}/60
              </div>
            </label>
          </div>

          <div style={previewCardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              partner_pricing
            </div>
            <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              代理商折扣梯度
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
              代理商折扣仅用于 web 端合作伙伴后台。5000 元档位按商品标价金额判断；10000 / 20000 / 50000 档位按折后实际付款额判断。
            </div>

            <div style={{ display: 'grid', gap: '12px', marginTop: '18px' }}>
              {draftShopPartnerPricingTiers.map((tier, index) => (
                <div
                  key={`${tier.threshold}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    padding: '14px',
                    borderRadius: '14px',
                    backgroundColor: '#fff',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <label style={fieldStyle}>
                    <span style={fieldLabelStyle}>实际付款额门槛（元）</span>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={tier.threshold}
                      onChange={(event) => {
                        const nextValue = Math.max(0, Number(event.target.value) || 0);
                        setDraftShopPartnerPricingTiers((currentTiers) => currentTiers.map((currentTier, currentIndex) => (
                          currentIndex === index ? { ...currentTier, threshold: nextValue } : currentTier
                        )));
                      }}
                      style={fieldInputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span style={fieldLabelStyle}>折扣率</span>
                    <input
                      type="number"
                      min="0.01"
                      max="1"
                      step="0.01"
                      value={tier.discountRate}
                      onChange={(event) => {
                        const nextValue = Math.min(1, Math.max(0.01, Number(event.target.value) || 0.01));
                        setDraftShopPartnerPricingTiers((currentTiers) => currentTiers.map((currentTier, currentIndex) => (
                          currentIndex === index ? { ...currentTier, discountRate: nextValue } : currentTier
                        )));
                      }}
                      style={fieldInputStyle}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'meditation' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={previewCardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              page_masthead
            </div>
            <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              冥想 PageMasthead
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
              设置【冥想】页面页眉的 slogan 文案。
            </div>
            <label style={{ ...fieldStyle, marginTop: '18px' }}>
              <span style={fieldLabelStyle}>冥想 slogan</span>
              <input
                type="text"
                maxLength="60"
                value={draftMeditationSlogan}
                onChange={(event) => setDraftMeditationSlogan(normalizeSloganInput(event.target.value))}
                style={fieldInputStyle}
              />
              <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                不超过 60 字符，纯文字。当前 {draftMeditationSlogan.length}/60
              </div>
            </label>
          </div>

          <MeditationSettings
            key={`${meditationSettings.documentId || 'default'}-${meditationSettings.rewardPoints}-${String(meditationSettings.allowRepeatRewards)}-${meditationSettings.inviterRewardRate || 0}`}
            settings={meditationSettings}
            error={error}
            saving={savingMeditationSettings}
            onSave={onSaveMeditationSettings}
          />
        </div>
      )}

      {activeTab === 'distribution' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div style={previewCardStyle}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              client_distribution
            </div>
            <div style={{ marginTop: '10px', fontSize: '22px', fontWeight: 700, color: '#111827' }}>
              客户端分发
            </div>
            <div style={{ marginTop: '8px', fontSize: '14px', color: '#475569', lineHeight: 1.7 }}>
              App 预览入口已经可用，Android 本地 `debug APK` 也已生成。这里同时保留后续正式 APK 与 iOS 分发地址的配置位。
            </div>

            {isLocalAdmin && (
              <div style={{ marginTop: '16px', ...previewCardStyle, backgroundColor: '#ffffff' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>本地 Android 构建</div>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#475569', lineHeight: 1.7 }}>
                  这个按钮只在本地 `admin` 开发环境可用。点击后会在当前机器上重新执行 Android `debug APK` 构建。
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={handleTriggerLocalAndroidBuild}
                    disabled={localBuildStatus.building}
                    style={localBuildStatus.building ? disabledButtonStyle : primaryButtonStyle}
                  >
                    {localBuildStatus.building ? '重打中...' : '重打 Android APK'}
                  </button>
                </div>

                <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b', lineHeight: 1.7 }}>
                  {localBuildStatus.lastBuiltAt
                    ? `最近一次成功构建：${new Date(localBuildStatus.lastBuiltAt).toLocaleString('zh-CN', { hour12: false })}`
                    : '还没有成功构建记录。'}
                </div>
                {localBuildStatus.lastError && (
                  <div style={{ marginTop: '10px', ...errorBannerStyle }}>
                    {localBuildStatus.lastError}
                  </div>
                )}
                {localBuildMessage && (
                  <div style={{ marginTop: '10px', ...(localBuildMessage.includes('失败') ? errorBannerStyle : successBannerStyle) }}>
                    {localBuildMessage}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gap: '14px', marginTop: '18px' }}>
              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>App 预览地址</span>
                <input
                  type="url"
                  value={draftPreviewUrl}
                  onChange={(event) => setDraftPreviewUrl(event.target.value)}
                  placeholder={derivedPreviewUrl}
                  style={fieldInputStyle}
                />
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                  留空时默认使用当前环境自动推导：{derivedPreviewUrl || '未识别'}
                </div>
              </label>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => resolvedPreviewUrl && window.open(resolvedPreviewUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!resolvedPreviewUrl}
                  style={primaryButtonStyle}
                >
                  打开 App 预览
                </button>
              </div>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>Android APK 下载地址</span>
                <input
                  type="url"
                  value={draftAndroidApkUrl}
                  onChange={(event) => setDraftAndroidApkUrl(event.target.value)}
                  placeholder={derivedAndroidApkUrl}
                  style={fieldInputStyle}
                />
                <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
                  留空时默认使用当前环境自动推导：{derivedAndroidApkUrl || '未识别'}
                </div>
              </label>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>iOS 分发地址</span>
                <input
                  type="url"
                  value={draftIosDistributionUrl}
                  onChange={(event) => setDraftIosDistributionUrl(event.target.value)}
                  placeholder="TestFlight 或安装页地址"
                  style={fieldInputStyle}
                />
              </label>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => resolvedAndroidApkUrl && window.open(resolvedAndroidApkUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!resolvedAndroidApkUrl}
                  style={resolvedAndroidApkUrl ? primaryButtonStyle : disabledButtonStyle}
                >
                  下载 Android APK
                </button>
                <button
                  type="button"
                  onClick={() => draftIosDistributionUrl && window.open(draftIosDistributionUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!draftIosDistributionUrl}
                  style={draftIosDistributionUrl ? secondaryActionButtonStyle : disabledButtonStyle}
                >
                  打开 iOS 分发
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'home' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => { void handleSaveHomeSettings(); }}
            disabled={saving || savingPageMasthead}
            style={primaryButtonStyle}
          >
            {(saving || savingPageMasthead) ? '保存中...' : '保存首页设置'}
          </button>
        </div>
      )}

      {activeTab === 'avatar' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={async () => {
              await onSave({ ...settings, theme: draftTheme, showDebugCard: draftShowDebugCard });
              await onSaveUserAvatarOptions({ ...userAvatarOptionsSettings, avatars: draftAvatarOptions });
            }}
            disabled={savingAvatarOptions || saving}
            style={primaryButtonStyle}
          >
            {(savingAvatarOptions || saving) ? '保存中...' : '保存我的设置'}
          </button>
        </div>
      )}

      {activeTab === 'awareness' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => { void handleSaveAwarenessSettings(); }}
            disabled={savingAwarenessDisplay || savingPageMasthead}
            style={primaryButtonStyle}
          >
            {(savingAwarenessDisplay || savingPageMasthead) ? '保存中...' : '保存觉察设置'}
          </button>
        </div>
      )}

      {activeTab === 'shop' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => { void handleSaveShopSettings(); }}
            disabled={savingPageMasthead || savingShopPartnerPricing}
            style={primaryButtonStyle}
          >
            {(savingPageMasthead || savingShopPartnerPricing) ? '保存中...' : '保存工坊设置'}
          </button>
        </div>
      )}

      {activeTab === 'meditation' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => { void handleSaveMeditationSettings(); }}
            disabled={savingPageMasthead}
            style={primaryButtonStyle}
          >
            {savingPageMasthead ? '保存中...' : '保存冥想设置'}
          </button>
        </div>
      )}

      {activeTab === 'distribution' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => onSaveClientDistribution({
              ...clientDistributionSettings,
              previewUrl: draftPreviewUrl,
              androidApkUrl: draftAndroidApkUrl,
              iosDistributionUrl: draftIosDistributionUrl
            })}
            disabled={savingClientDistribution}
            style={primaryButtonStyle}
          >
            {savingClientDistribution ? '保存中...' : '保存分发设置'}
          </button>
        </div>
      )}
    </section>
  );
};

const fieldStyle = {
  display: 'grid',
  gap: '6px'
};

const fieldLabelStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#475569'
};

const fieldInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '12px',
  border: '1px solid #cbd5e1',
  fontSize: '14px'
};

const previewCardStyle = {
  borderRadius: '18px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  padding: '18px'
};

const previewSwatchStyle = {
  borderRadius: '999px',
  padding: '10px 14px',
  fontSize: '13px',
  fontWeight: 700
};

const primaryButtonStyle = {
  border: 'none',
  borderRadius: '12px',
  backgroundColor: '#111827',
  color: '#fff',
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer'
};

const secondaryActionButtonStyle = {
  border: '1px solid #dbe4ee',
  borderRadius: '12px',
  backgroundColor: '#fff',
  color: '#334155',
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer'
};

const disabledButtonStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  backgroundColor: '#f3f4f6',
  color: '#9ca3af',
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'default'
};

const carouselSlideCardStyle = {
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#ffffff',
  padding: '14px'
};

const carouselPreviewFrameStyle = {
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: '12px',
  overflow: 'hidden',
  backgroundColor: '#e2e8f0'
};

const carouselPreviewImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block'
};

const carouselPreviewPlaceholderStyle = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
  fontSize: '12px'
};

const uploadButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: '10px',
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid #dbe4ee',
  backgroundColor: '#fff',
  color: '#334155',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  boxSizing: 'border-box'
};

const errorBannerStyle = {
  marginBottom: '16px',
  padding: '12px 14px',
  borderRadius: '12px',
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  fontSize: '13px',
  lineHeight: 1.6
};

const successBannerStyle = {
  padding: '12px 14px',
  borderRadius: '12px',
  backgroundColor: '#f0fdf4',
  color: '#15803d',
  fontSize: '13px',
  lineHeight: 1.6
};

export default ThemeSettings;
