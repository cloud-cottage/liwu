import React, { useState } from 'react';
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
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [activeUserSection, setActiveUserSection] = useState('users');
  
  const {
    users,
    tags,
    categories,
    meditationSettings,
    awarenessTagSettings,
    badgeSettings,
    themeSettings,
    brandCarouselSettings,
    userAvatarOptionsSettings,
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
    savingBadgeSettings,
    savingThemeSettings,
    savingBrandCarouselSettings,
    savingUserAvatarOptionsSettings,
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
    updateBadgeSettings,
    updateThemeSettings,
    updateBrandCarouselSettings,
    updateUserAvatarOptionsSettings,
    updateStudentMembershipSettings,
    saveShopProduct,
    updateShopOrderStatus,
    refresh
  } = useDatabase();

  const handleRefreshCloudbase = () => {
    window.location.reload();
  };

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
  const activeUsers = users.filter(user => user.status === 'active').length;
  const usersWithTags = users.filter(user => user.tags.length > 0).length;
  const totalTagAssignments = users.reduce((sum, user) => sum + user.tags.length, 0);
  const totalShopProducts = shopProducts.length;
  const totalShopOrders = shopOrders.length;
  const totalShopSkus = shopSkus.length;

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      backgroundColor: '#f5f5f5', 
      width: '100vw',
      margin: 0,
      padding: 0,
      boxSizing: 'border-box'
    }}>
      {/* Sidebar */}
      <div style={{
        width: '260px',
        backgroundColor: '#fff',
        boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh'
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid #eee' }}>
          <h1 style={{ fontSize: '20px', margin: 0, color: '#333' }}>管理后台</h1>
          <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 8px 0' }}>
            社区运营与内容管理面板
          </p>
          <DatabaseStatus />
        </div>

        {/* Navigation Menu */}
        <nav style={{ flex: 1, padding: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'overview' ? '#2196F3' : 'transparent',
                color: activeTab === 'overview' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>总览</span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'users' ? '#2196F3' : 'transparent',
                color: activeTab === 'users' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>用户</span>
            </button>
            <button
              onClick={() => setActiveTab('shop')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'shop' ? '#2196F3' : 'transparent',
                color: activeTab === 'shop' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>工坊</span>
            </button>
            <button
              onClick={() => setActiveTab('meditation')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'meditation' ? '#2196F3' : 'transparent',
                color: activeTab === 'meditation' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>冥想</span>
            </button>
            <button
              onClick={() => setActiveTab('awareness')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'awareness' ? '#2196F3' : 'transparent',
                color: activeTab === 'awareness' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>觉察</span>
            </button>
            <button
              onClick={() => setActiveTab('badges')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'badges' ? '#2196F3' : 'transparent',
                color: activeTab === 'badges' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>徽章</span>
            </button>
            <button
              onClick={() => setActiveTab('fortune')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'fortune' ? '#2196F3' : 'transparent',
                color: activeTab === 'fortune' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>福豆</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'settings' ? '#2196F3' : 'transparent',
                color: activeTab === 'settings' ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <span>设置</span>
            </button>
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
              transition: 'all 0.2s ease'
            }}
          >
            刷新云端状态
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '32px', overflowY: 'auto', maxWidth: 'calc(100vw - 260px)' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            <div style={{
              backgroundColor: '#fff',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#2196F3', marginBottom: '12px' }}>
                {totalUsers}
              </div>
              <div style={{ fontSize: '16px', color: '#666' }}>总用户数</div>
            </div>
            
            <div style={{
              backgroundColor: '#fff',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#4CAF50', marginBottom: '12px' }}>
                {activeUsers}
              </div>
              <div style={{ fontSize: '16px', color: '#666' }}>活跃用户</div>
            </div>
            
            <div style={{
              backgroundColor: '#fff',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#FF9800', marginBottom: '12px' }}>
                {usersWithTags}
              </div>
              <div style={{ fontSize: '16px', color: '#666' }}>已打标签用户</div>
            </div>
            
            <div style={{
              backgroundColor: '#fff',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#9C27B0', marginBottom: '12px' }}>
                {totalTagAssignments}
              </div>
              <div style={{ fontSize: '16px', color: '#666' }}>标签分配总数</div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#0f766e', marginBottom: '12px' }}>
                {totalShopProducts}
              </div>
              <div style={{ fontSize: '16px', color: '#666' }}>工坊商品数</div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#b45309', marginBottom: '12px' }}>
                {totalShopSkus}
              </div>
              <div style={{ fontSize: '16px', color: '#666' }}>工坊规格数</div>
            </div>

            <div style={{
              backgroundColor: '#fff',
              padding: '32px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              textAlign: 'center',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#1d4ed8', marginBottom: '12px' }}>
                {totalShopOrders}
              </div>
              <div style={{ fontSize: '16px', color: '#666' }}>工坊订单数</div>
            </div>
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
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '28px',
            boxShadow: 'var(--shadow-sm)',
            color: '#64748b',
            fontSize: '14px'
          }}>
            冥想后台页面暂未接入，后续在这里补充专属管理内容。
          </div>
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
            brandCarouselSettings={brandCarouselSettings}
            userAvatarOptionsSettings={userAvatarOptionsSettings}
            error={settingsError}
            saving={savingThemeSettings}
            savingCarousel={savingBrandCarouselSettings}
            savingAvatarOptions={savingUserAvatarOptionsSettings}
            onSave={handleSaveThemeSettings}
            onSaveBrandCarousel={handleSaveBrandCarouselSettings}
            onSaveUserAvatarOptions={handleSaveUserAvatarOptionsSettings}
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

export default Dashboard;
