import React, { useEffect, useMemo, useState } from 'react';
import UserList from '../components/Dashboard/UserList';
import UserEditModal from '../components/Dashboard/UserEditModal';
import TagManager from '../components/Dashboard/TagManager';
import TagStatistics from '../components/Dashboard/TagStatistics';
import TagManagement from '../components/Dashboard/TagManagement';
import DatabaseStatus from '../components/Dashboard/DatabaseStatus';
import MeditationSettings from '../components/Dashboard/MeditationSettings.jsx';
import AwarenessTagSettings from '../components/Dashboard/AwarenessTagSettings.jsx';
import BadgeSettings from '../components/Dashboard/BadgeSettings.jsx';
import ShopManagement from '../components/Dashboard/ShopManagement.jsx';
import ThemeSettings from '../components/Dashboard/ThemeSettings.jsx';
import StudentMembershipSettings from '../components/Dashboard/StudentMembershipSettings.jsx';
import MeditationPage from '../components/Dashboard/MeditationPage.jsx';
import { useDatabase } from '../hooks/useDatabase.js';

// Add CSS reset to remove default margins
const addCSSReset = () => {
  const style = document.createElement('style');
  style.textContent = `
    body, html {
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
    * {
      box-sizing: border-box !important;
    }
  `;
  document.head.appendChild(style);
};

// Apply CSS reset when component mounts
if (typeof window !== 'undefined') {
  addCSSReset();
}

const Dashboard = () => {
  const readInitialSidebarState = () => {
    if (typeof window === 'undefined') {
      return true;
    }

    const storedValue = window.localStorage.getItem('liwu_admin_sidebar_open');
    return storedValue === null ? true : storedValue === '1';
  };

  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeUserSection, setActiveUserSection] = useState('users');
  const [sidebarOpen, setSidebarOpen] = useState(readInitialSidebarState);
  
  const {
    users,
    tags,
    categories,
    overviewStats,
    meditationSettings,
    awarenessTagSettings,
    awarenessDisplaySettings,
    badgeSettings,
    themeSettings,
    brandCarouselSettings,
    userAvatarOptionsSettings,
    clientDistributionSettings,
    studentMembershipSettings,
    awarenessTagOverview,
    shopCategories,
    shopProducts,
    shopSkus,
    shopOrders,
    shopOrderItems,
    settingsError,
    savingMeditationSettings,
    savingAwarenessTagSettings,
    savingAwarenessDisplaySettings,
    savingBadgeSettings,
    savingThemeSettings,
    savingBrandCarouselSettings,
    savingUserAvatarOptionsSettings,
    savingClientDistributionSettings,
    savingStudentMembershipSettings,
    loading,
    error,
    updateUser,
    updateCategory,
    createCategory,
    updateTag,
    createTag,
    updateUserTags,
    updateMeditationSettings,
    updateAwarenessTagSettings,
    updateAwarenessDisplaySettings,
    updateBadgeSettings,
    updateThemeSettings,
    updateBrandCarouselSettings,
    updateUserAvatarOptionsSettings,
    updateClientDistributionSettings,
    updateStudentMembershipSettings,
    saveShopProduct,
    updateShopOrderStatus,
    meditationAudioLibrary,
    meditationCompositionSettings,
    meditationCalendar,
    meditationLibrary,
    savingMeditationAudioLibrary,
    savingMeditationCompositionSettings,
    savingMeditationCalendar,
    savingMeditationLibrary,
    updateMeditationAudioLibrary,
    updateMeditationCompositionSettings,
    updateMeditationCalendar,
    updateMeditationLibrary,
    refresh
  } = useDatabase();

  const handleRefreshCloudbase = () => {
    window.location.reload();
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem('liwu_admin_sidebar_open', sidebarOpen ? '1' : '0');
  }, [sidebarOpen]);

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setIsEditModalOpen(true);
  };

  const handleManageTags = (user) => {
    setSelectedUser(user);
    setIsTagManagerOpen(true);
  };

  const handleSaveUser = async (userId, userData) => {
    try {
      await updateUser(userId, userData);
    } catch (err) {
      console.error('Failed to save user:', err);
    }
  };

  const handleUpdateUserTags = async (userId, newTags) => {
    try {
      await updateUserTags(userId, newTags);
    } catch (err) {
      console.error('Failed to update user tags:', err);
    }
  };

  const handleUpdateCategories = async (categoryUpdate) => {
    try {
      if (categoryUpdate.id) {
        await updateCategory(categoryUpdate);
      } else {
        await createCategory(categoryUpdate);
      }
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  };

  const handleUpdateTags = async (tagUpdate) => {
    try {
      if (tagUpdate.id) {
        await updateTag(tagUpdate);
      } else {
        await createTag(tagUpdate);
      }
    } catch (err) {
      console.error('Failed to update tag:', err);
    }
  };

  const handleSaveMeditationSettings = async (nextSettings) => {
    try {
      await updateMeditationSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update meditation settings:', err);
    }
  };

  const handleSaveAwarenessTagSettings = async (nextSettings) => {
    try {
      await updateAwarenessTagSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update awareness tag settings:', err);
    }
  };

  const handleSaveAwarenessDisplaySettings = async (nextSettings) => {
    try {
      await updateAwarenessDisplaySettings(nextSettings);
    } catch (err) {
      console.error('Failed to update awareness display settings:', err);
    }
  };

  const handleSaveBadgeSettings = async (nextSettings) => {
    try {
      await updateBadgeSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update badge settings:', err);
    }
  };

  const handleSaveThemeSettings = async (nextSettings) => {
    try {
      await updateThemeSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update theme settings:', err);
    }
  };

  const handleSaveBrandCarouselSettings = async (nextSettings) => {
    try {
      await updateBrandCarouselSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update brand carousel settings:', err);
    }
  };

  const handleSaveClientDistributionSettings = async (nextSettings) => {
    try {
      await updateClientDistributionSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update client distribution settings:', err);
    }
  };

  const handleSaveUserAvatarOptionsSettings = async (nextSettings) => {
    try {
      await updateUserAvatarOptionsSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update user avatar options settings:', err);
    }
  };

  const handleSaveStudentMembershipSettings = async (nextSettings) => {
    try {
      await updateStudentMembershipSettings(nextSettings);
    } catch (err) {
      console.error('Failed to update student membership settings:', err);
    }
  };

  const handleSaveShopProduct = async (productDraft) => {
    try {
      await saveShopProduct(productDraft);
    } catch (err) {
      console.error('Failed to save shop product:', err);
    }
  };

  const handleUpdateShopOrderStatus = async (orderId, nextStatus) => {
    try {
      await updateShopOrderStatus(orderId, nextStatus);
    } catch (err) {
      console.error('Failed to update shop order status:', err);
    }
  };

  const totalUsers = users.length;
  const totalAwarenessTags = awarenessTagOverview.length;
  const totalShopProducts = shopProducts.length;
  const totalShopOrders = shopOrders.length;
  const listedShopProducts = shopProducts.filter((product) => product.status === 'active').length;

  const recentDateKeys = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const today = new Date();

    return Array.from({ length: 7 }, (_, index) => {
      const nextDate = new Date(today);
      nextDate.setDate(today.getDate() - (6 - index));
      return formatter.format(nextDate);
    });
  }, []);

  const userLoginSeries = useMemo(() => {
    const counterMap = new Map(recentDateKeys.map((dateKey) => [dateKey, 0]));
    users.forEach((user) => {
      const timestamp = new Date(user.lastActive || 0).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return;
      }

      const dateKey = recentDateKeys.find((key) => key === new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date(timestamp)));
      if (!dateKey) {
        return;
      }

      counterMap.set(dateKey, Number(counterMap.get(dateKey) || 0) + 1);
    });

    return recentDateKeys.map((dateKey) => ({
      label: dateKey.slice(5).replace('-', '/'),
      value: Number(counterMap.get(dateKey) || 0)
    }));
  }, [recentDateKeys, users]);

  const sevenDayLoggedInUsers = useMemo(
    () => userLoginSeries.reduce((total, item) => total + item.value, 0),
    [userLoginSeries]
  );

  const awarenessSeries = useMemo(
    () => (overviewStats.awarenessDailyCounts || []).map((item) => ({
      label: String(item.dateKey || '').slice(5).replace('-', '/'),
      value: Number(item.value || 0)
    })),
    [overviewStats.awarenessDailyCounts]
  );

  const meditationCountSeries = useMemo(
    () => (overviewStats.meditationDailyCounts || []).map((item) => ({
      label: String(item.dateKey || '').slice(5).replace('-', '/'),
      value: Number(item.value || 0)
    })),
    [overviewStats.meditationDailyCounts]
  );

  const meditationDurationSeries = useMemo(
    () => (overviewStats.meditationDailyDurationMinutes || []).map((item) => ({
      label: String(item.dateKey || '').slice(5).replace('-', '/'),
      value: Number(item.value || 0)
    })),
    [overviewStats.meditationDailyDurationMinutes]
  );

  const shopOrderSeries = useMemo(() => {
    const counterMap = new Map(recentDateKeys.map((dateKey) => [dateKey, 0]));
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    shopOrders.forEach((order) => {
      const timestamp = new Date(order.createdAt || 0).getTime();
      if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return;
      }

      const dateKey = formatter.format(new Date(timestamp));
      if (!counterMap.has(dateKey)) {
        return;
      }

      counterMap.set(dateKey, Number(counterMap.get(dateKey) || 0) + 1);
    });

    return recentDateKeys.map((dateKey) => ({
      label: dateKey.slice(5).replace('-', '/'),
      value: Number(counterMap.get(dateKey) || 0)
    }));
  }, [recentDateKeys, shopOrders]);

  const NAV_ITEMS = [
    { key: 'overview', label: '总览' },
    { key: 'users',    label: '用户' },
    { key: 'shop',     label: '工坊' },
    { key: 'meditation', label: '冥想' },
    { key: 'awareness', label: '觉察' },
    { key: 'badges',   label: '徽章' },
    { key: 'fortune',  label: '福豆' },
    { key: 'settings', label: '设置' },
  ];

  const handleNavClick = (key) => {
    setActiveTab(key);
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      width: '100%',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box',
      overflow: 'hidden',
    }}>
      {/* Sidebar */}
      <div style={{
        width: sidebarOpen ? '240px' : '0px',
        minWidth: sidebarOpen ? '240px' : '0px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        backgroundColor: '#fff',
        borderRight: sidebarOpen ? '1px solid #eee' : 'none',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.25s ease, min-width 0.25s ease',
        flexShrink: 0,
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
          <h1 style={{ fontSize: '20px', margin: 0, color: '#333', whiteSpace: 'nowrap' }}>管理后台</h1>
          <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 8px 0', whiteSpace: 'nowrap' }}>
            社区运营与内容管理面板
          </p>
          <DatabaseStatus />
        </div>

        {/* Navigation Menu */}
        <nav style={{ flex: 1, padding: '12px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {NAV_ITEMS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleNavClick(key)}
                style={{
                  padding: '11px 16px',
                  border: 'none',
                  borderRadius: '8px',
                  backgroundColor: activeTab === key ? '#2196F3' : 'transparent',
                  color: activeTab === key ? '#fff' : '#555',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  textAlign: 'left',
                  transition: 'background-color 0.15s',
                  width: '100%',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid #eee' }}>
          <button
            onClick={handleRefreshCloudbase}
            style={{
              width: '100%',
              padding: '8px 16px',
              border: '1px solid #2196F3',
              borderRadius: '8px',
              backgroundColor: '#fff',
              color: '#2196F3',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.2s ease',
            }}
          >
            刷新云端状态
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
        {/* Top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 30,
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '12px 20px',
          backgroundColor: '#fff',
          borderBottom: '1px solid #eee',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 8px', borderRadius: '6px',
              display: 'flex', flexDirection: 'column', gap: '4px',
            }}
          >
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: '#555', borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: '#555', borderRadius: '2px' }} />
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: '#555', borderRadius: '2px' }} />
          </button>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#333' }}>
            {NAV_ITEMS.find(n => n.key === activeTab)?.label ?? '管理后台'}
          </span>
        </div>

        <div style={{ flex: 1, padding: '28px 24px', overflowY: 'auto' }}>
        {/* Loading State */}
        {loading && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '200px',
            fontSize: '16px',
            color: '#666'
          }}>
            正在从 CloudBase 加载数据...
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={{ 
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <strong>错误：</strong> {error}
            <button
              onClick={() => window.location.reload()}
              style={{
                marginLeft: '16px',
                padding: '4px 12px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: '#c62828',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              重试
            </button>
          </div>
        )}

        {/* Overview Tab */}
        {!loading && !error && activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <OverviewCard title="用户">
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'center' }}>
                <DonutMetric
                  primaryValue={sevenDayLoggedInUsers}
                  secondaryValue={Math.max(0, totalUsers - sevenDayLoggedInUsers)}
                  primaryLabel="七日内登录用户"
                  secondaryLabel="总用户数"
                  primaryColor="#2563eb"
                  secondaryColor="#dbeafe"
                  centerLabel={`${sevenDayLoggedInUsers}/${totalUsers}`}
                />
                <LineMetric
                  title="每日登录用户数"
                  series={userLoginSeries}
                  color="#2563eb"
                />
              </div>
            </OverviewCard>

            <OverviewCard title="觉察">
              <div style={{ display: 'grid', gap: '20px' }}>
                <div>
                  <div style={metricKickerStyle}>觉察标签总数</div>
                  <div style={metricBigValueStyle}>{totalAwarenessTags}</div>
                </div>
                <LineMetric
                  title="每日标记觉察数"
                  series={awarenessSeries}
                  color="#0f766e"
                />
              </div>
            </OverviewCard>

            <OverviewCard title="工坊">
              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '24px', alignItems: 'center' }}>
                <DonutMetric
                  primaryValue={listedShopProducts}
                  secondaryValue={Math.max(0, totalShopProducts - listedShopProducts)}
                  primaryLabel="商品上架数"
                  secondaryLabel="商品总数"
                  primaryColor="#b45309"
                  secondaryColor="#fde7d2"
                  centerLabel={`${listedShopProducts}/${totalShopProducts}`}
                />
                <LineMetric
                  title="每日订单数量"
                  series={shopOrderSeries}
                  color="#b45309"
                />
              </div>
            </OverviewCard>

            <OverviewCard title="冥想">
              <div style={{ display: 'grid', gap: '20px' }}>
                <MultiLineMetric
                  title="每日冥想播放次数 / 每日冥想播放时长"
                  seriesList={[
                    {
                      key: 'count',
                      label: '播放次数',
                      color: '#6b8e23',
                      series: meditationCountSeries
                    },
                    {
                      key: 'duration',
                      label: '播放时长',
                      color: '#8f5fd7',
                      series: meditationDurationSeries
                    }
                  ]}
                />
              </div>
            </OverviewCard>
          </div>
        )}

        {/* Users Tab */}
        {!loading && !error && activeTab === 'users' && (
          <div style={{ display: 'grid', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {[
                { key: 'users', label: '用户列表' },
                { key: 'studentUsers', label: '学员用户' },
                { key: 'tagManagement', label: '标签管理' },
                { key: 'tagStatistics', label: '标签统计' }
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveUserSection(item.key)}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    backgroundColor: activeUserSection === item.key ? '#111827' : '#fff',
                    color: activeUserSection === item.key ? '#fff' : '#334155',
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

            {activeUserSection === 'users' && (
              <UserList 
                users={users} 
                onEditUser={handleEditUser}
                onManageTags={handleManageTags}
              />
            )}

            {activeUserSection === 'studentUsers' && (
              <StudentMembershipSettings
                settings={studentMembershipSettings}
                users={users}
                saving={savingStudentMembershipSettings}
                error={settingsError}
                onSave={handleSaveStudentMembershipSettings}
              />
            )}

            {activeUserSection === 'tagManagement' && (
              <TagManagement
                users={users}
                tagCategories={categories}
                tags={tags}
                onUpdateCategories={handleUpdateCategories}
                onUpdateTags={handleUpdateTags}
              />
            )}

            {activeUserSection === 'tagStatistics' && (
              <TagStatistics 
                users={users} 
                tagCategories={categories}
              />
            )}
          </div>
        )}

        {!loading && !error && activeTab === 'shop' && (
          <ShopManagement
            categories={shopCategories}
            products={shopProducts}
            skus={shopSkus}
            orders={shopOrders}
            orderItems={shopOrderItems}
            onSaveProduct={handleSaveShopProduct}
            onUpdateOrderStatus={handleUpdateShopOrderStatus}
          />
        )}

        {!loading && !error && activeTab === 'meditation' && (
          <MeditationPage
            meditationAudioLibrary={meditationAudioLibrary}
            meditationCompositionSettings={meditationCompositionSettings}
            meditationCalendar={meditationCalendar}
            meditationLibrary={meditationLibrary}
            savingMeditationAudioLibrary={savingMeditationAudioLibrary}
            savingMeditationCompositionSettings={savingMeditationCompositionSettings}
            savingMeditationCalendar={savingMeditationCalendar}
            savingMeditationLibrary={savingMeditationLibrary}
            updateMeditationAudioLibrary={updateMeditationAudioLibrary}
            updateMeditationCompositionSettings={updateMeditationCompositionSettings}
            updateMeditationCalendar={updateMeditationCalendar}
            updateMeditationLibrary={updateMeditationLibrary}
            settingsError={settingsError}
          />
        )}

        {!loading && !error && activeTab === 'fortune' && (
          <MeditationSettings
            key={`${meditationSettings.documentId || 'default'}-${meditationSettings.rewardPoints}-${String(meditationSettings.allowRepeatRewards)}-${meditationSettings.inviterRewardRate || 0}`}
            settings={meditationSettings}
            error={settingsError}
            saving={savingMeditationSettings}
            onSave={handleSaveMeditationSettings}
          />
        )}

        {!loading && !error && activeTab === 'settings' && (
          <ThemeSettings
            key={`${themeSettings.documentId || 'default'}-${themeSettings.theme}`}
            settings={themeSettings}
            awarenessDisplaySettings={awarenessDisplaySettings}
            brandCarouselSettings={brandCarouselSettings}
            userAvatarOptionsSettings={userAvatarOptionsSettings}
            clientDistributionSettings={clientDistributionSettings}
            error={settingsError}
            saving={savingThemeSettings}
            savingAwarenessDisplay={savingAwarenessDisplaySettings}
            savingCarousel={savingBrandCarouselSettings}
            savingAvatarOptions={savingUserAvatarOptionsSettings}
            savingClientDistribution={savingClientDistributionSettings}
            onSave={handleSaveThemeSettings}
            onSaveAwarenessDisplay={handleSaveAwarenessDisplaySettings}
            onSaveBrandCarousel={handleSaveBrandCarouselSettings}
            onSaveUserAvatarOptions={handleSaveUserAvatarOptionsSettings}
            onSaveClientDistribution={handleSaveClientDistributionSettings}
          />
        )}

        {!loading && !error && activeTab === 'awareness' && (
          <AwarenessTagSettings
            key={awarenessTagSettings.documentId || 'default'}
            tags={awarenessTagOverview}
            settings={awarenessTagSettings}
            products={shopProducts}
            error={settingsError}
            saving={savingAwarenessTagSettings}
            onSave={handleSaveAwarenessTagSettings}
            onRefresh={refresh}
          />
        )}

        {!loading && !error && activeTab === 'badges' && (
          <BadgeSettings
            key={`${badgeSettings.documentId || 'default'}-${badgeSettings.version || 1}`}
            settings={badgeSettings}
            error={settingsError}
            saving={savingBadgeSettings}
            onSave={handleSaveBadgeSettings}
          />
        )}

        </div>
      </div>

      {/* Modals */}
      {isEditModalOpen && selectedUser && (
        <UserEditModal
          key={selectedUser.id}
          user={selectedUser}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveUser}
        />
      )}

      {isTagManagerOpen && selectedUser && (
        <TagManager
          key={selectedUser.id}
          user={selectedUser}
          isOpen={isTagManagerOpen}
          onClose={() => setIsTagManagerOpen(false)}
          allTags={tags}
          tagCategories={categories}
          onUpdateUserTags={handleUpdateUserTags}
        />
      )}
    </div>
  );
};

const OverviewCard = ({ title, children }) => (
  <section
    style={{
      backgroundColor: '#fff',
      padding: '28px',
      borderRadius: '20px',
      boxShadow: 'var(--shadow-sm)',
      display: 'grid',
      gap: '20px'
    }}
  >
    <div style={{ fontSize: '24px', fontWeight: 700, color: '#111827' }}>{title}</div>
    {children}
  </section>
);

const DonutMetric = ({
  primaryValue,
  secondaryValue,
  primaryLabel,
  secondaryLabel,
  primaryColor,
  secondaryColor,
  centerLabel
}) => {
  const totalValue = Math.max(1, Number(primaryValue || 0) + Number(secondaryValue || 0));
  const ratio = Math.max(0, Math.min(1, Number(primaryValue || 0) / totalValue));
  const angle = Math.round(ratio * 360);

  return (
    <div style={{ display: 'grid', gap: '16px', justifyItems: 'center' }}>
      <div
        style={{
          width: '164px',
          height: '164px',
          borderRadius: '50%',
          background: `conic-gradient(${primaryColor} 0deg ${angle}deg, ${secondaryColor} ${angle}deg 360deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
      >
        <div
          style={{
            width: '106px',
            height: '106px',
            borderRadius: '50%',
            backgroundColor: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '8px',
            boxSizing: 'border-box',
            fontSize: '18px',
            fontWeight: 700,
            color: '#111827',
            lineHeight: 1.3
          }}
        >
          {centerLabel}
        </div>
      </div>

      <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
        <LegendItem color={primaryColor} label={primaryLabel} value={primaryValue} />
        <LegendItem color={secondaryColor} label={secondaryLabel} value={secondaryValue} />
      </div>
    </div>
  );
};

const LegendItem = ({ color, label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', fontSize: '13px', color: '#475569' }}>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
      <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: color, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
    <strong style={{ fontSize: '14px', color: '#111827' }}>{value}</strong>
  </div>
);

const LineMetric = ({ title, series, color, suffix = '' }) => {
  const safeSeries = Array.isArray(series) && series.length > 0
    ? series
    : Array.from({ length: 7 }, (_, index) => ({ label: `${index + 1}`, value: 0 }));
  const maxValue = Math.max(...safeSeries.map((item) => Number(item.value || 0)), 1);
  const points = safeSeries.map((item, index) => {
    const x = safeSeries.length === 1 ? 0 : (index / (safeSeries.length - 1)) * 100;
    const y = 100 - ((Number(item.value || 0) / maxValue) * 100);
    return `${x},${y}`;
  }).join(' ');
  const latestValue = Number(safeSeries[safeSeries.length - 1]?.value || 0);

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{title}</div>
        <div style={{ fontSize: '13px', color: '#64748b' }}>
          最新 {latestValue}{suffix}
        </div>
      </div>

      <div style={{ position: 'relative', height: '144px', borderRadius: '16px', backgroundColor: '#f8fafc', padding: '14px 14px 28px', boxSizing: 'border-box' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {[25, 50, 75].map((line) => (
            <line key={line} x1="0" y1={line} x2="100" y2={line} stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div style={{ position: 'absolute', left: '14px', right: '14px', bottom: '10px', display: 'grid', gridTemplateColumns: `repeat(${safeSeries.length}, minmax(0, 1fr))`, gap: '8px' }}>
          {safeSeries.map((item) => (
            <div key={item.label} style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MultiLineMetric = ({ title, seriesList = [] }) => {
  const normalizedSeriesList = seriesList.filter((item) => Array.isArray(item.series) && item.series.length > 0);
  const fallbackSeries = Array.from({ length: 7 }, (_, index) => ({ label: `${index + 1}`, value: 0 }));
  const baseSeries = normalizedSeriesList[0]?.series || fallbackSeries;
  const maxValue = Math.max(
    1,
    ...normalizedSeriesList.flatMap((item) => item.series.map((point) => Number(point.value || 0)))
  );

  const buildPoints = (series) => series.map((item, index) => {
    const x = series.length === 1 ? 0 : (index / (series.length - 1)) * 100;
    const y = 100 - ((Number(item.value || 0) / maxValue) * 100);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{title}</div>
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {normalizedSeriesList.map((item) => (
            <div key={item.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#475569' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '999px', backgroundColor: item.color }} />
              <span>{item.label}</span>
              <strong style={{ color: '#111827' }}>{Number(item.series[item.series.length - 1]?.value || 0)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', height: '160px', borderRadius: '16px', backgroundColor: '#f8fafc', padding: '14px 14px 28px', boxSizing: 'border-box' }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          {[25, 50, 75].map((line) => (
            <line key={line} x1="0" y1={line} x2="100" y2={line} stroke="#e2e8f0" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {normalizedSeriesList.map((item) => (
            <polyline
              key={item.key}
              fill="none"
              stroke={item.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={buildPoints(item.series)}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div style={{ position: 'absolute', left: '14px', right: '14px', bottom: '10px', display: 'grid', gridTemplateColumns: `repeat(${baseSeries.length}, minmax(0, 1fr))`, gap: '8px' }}>
          {baseSeries.map((item) => (
            <div key={item.label} style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const metricKickerStyle = {
  fontSize: '12px',
  fontWeight: 700,
  color: '#94a3b8',
  letterSpacing: '0.08em',
  textTransform: 'uppercase'
};

const metricBigValueStyle = {
  marginTop: '8px',
  fontSize: '42px',
  fontWeight: 700,
  color: '#111827',
  lineHeight: 1
};

export default Dashboard;
