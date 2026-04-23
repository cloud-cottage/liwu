import React, { useEffect, useMemo, useState } from 'react';
import { THEME_PRESETS, getThemePreset } from '@liwu/shared-utils/theme-system.js';
import { uploadImageAsWebp } from '../../utils/imageUpload.js';

const ThemeSettings = ({
  settings,
  brandCarouselSettings,
  userAvatarOptionsSettings,
  error,
  saving,
  savingCarousel,
  savingAvatarOptions,
  onSave,
  onSaveBrandCarousel,
  onSaveUserAvatarOptions
}) => {
  const [activeTab, setActiveTab] = useState('theme');
  const [draftTheme, setDraftTheme] = useState(settings.theme);
  const [draftShowDebugCard, setDraftShowDebugCard] = useState(Boolean(settings.showDebugCard));
  const [draftSlides, setDraftSlides] = useState(() => brandCarouselSettings.slides || []);
  const [draftAvatarOptions, setDraftAvatarOptions] = useState(() => userAvatarOptionsSettings.avatars || []);
  const [uploadingSlideIndex, setUploadingSlideIndex] = useState(-1);
  const [uploadingAvatarIndex, setUploadingAvatarIndex] = useState(-1);
  const [carouselFeedback, setCarouselFeedback] = useState('');
  const [avatarFeedback, setAvatarFeedback] = useState('');
  const themeOptions = useMemo(() => Object.values(THEME_PRESETS), []);
  const activeTheme = getThemePreset(draftTheme);

  useEffect(() => {
    setDraftTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    setDraftShowDebugCard(Boolean(settings.showDebugCard));
  }, [settings.showDebugCard]);

  useEffect(() => {
    setDraftSlides(brandCarouselSettings.slides || []);
  }, [brandCarouselSettings.slides]);

  useEffect(() => {
    setDraftAvatarOptions(userAvatarOptionsSettings.avatars || []);
  }, [userAvatarOptionsSettings.avatars]);

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
          统一控制 app、web 和小程序三端同步使用的主题样式。
        </div>
      </div>

      {error && (
        <div style={errorBannerStyle}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { key: 'theme', label: '主题样式' },
          { key: 'avatar', label: '用户头像' }
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

      {activeTab === 'theme' && (
      <div style={{ display: 'grid', gap: '16px' }}>
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
      </div>
      )}

      {activeTab === 'avatar' && (
        <div style={{ display: 'grid', gap: '16px' }}>
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
        </div>
      )}

      {activeTab === 'theme' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => onSave({ ...settings, theme: draftTheme, showDebugCard: draftShowDebugCard })}
            disabled={saving}
            style={primaryButtonStyle}
          >
            {saving ? '保存中...' : '保存主题设置'}
          </button>
        </div>
      )}

      {activeTab === 'avatar' && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => onSaveUserAvatarOptions({ ...userAvatarOptionsSettings, avatars: draftAvatarOptions })}
            disabled={savingAvatarOptions}
            style={primaryButtonStyle}
          >
            {savingAvatarOptions ? '保存中...' : '保存头像设置'}
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
