import React, { useState } from 'react';
import UserList from '../components/Dashboard/UserList';
import UserEditModal from '../components/Dashboard/UserEditModal';
import TagManager from '../components/Dashboard/TagManager';
import TagStatistics from '../components/Dashboard/TagStatistics';
import TagManagement from '../components/Dashboard/TagManagement';
import DatabaseStatus from '../components/Dashboard/DatabaseStatus';
import MeditationSettings from '../components/Dashboard/MeditationSettings.jsx';
import AwarenessTagSettings from '../components/Dashboard/AwarenessTagSettings.jsx';
import ShopManagement from '../components/Dashboard/ShopManagement.jsx';
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
  
  const {
    users,
    tags,
    categories,
    meditationSettings,
    awarenessTagSettings,
    awarenessTagOverview,
    shopCategories,
    shopProducts,
    shopSkus,
    shopOrders,
    shopOrderItems,
    settingsError,
    savingMeditationSettings,
    savingAwarenessTagSettings,
    loading,
    error,
    updateUser,
    updateCategory,
    createCategory,
    updateTag,
    createTag,
    updateUserTags,
    updateMeditationSettings,
    updateAwarenessTagSettings
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
            用户管理与标签统计看板
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
              <span>用户管理</span>
            </button>
            <button
              onClick={() => setActiveTab('statistics')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'statistics' ? '#2196F3' : 'transparent',
                color: activeTab === 'statistics' ? '#fff' : '#666',
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
              <span>标签统计</span>
            </button>
            <button
              onClick={() => setActiveTab('tagManagement')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'tagManagement' ? '#2196F3' : 'transparent',
                color: activeTab === 'tagManagement' ? '#fff' : '#666',
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
              <span>标签管理</span>
            </button>
            <button
              onClick={() => setActiveTab('awarenessTags')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'awarenessTags' ? '#2196F3' : 'transparent',
                color: activeTab === 'awarenessTags' ? '#fff' : '#666',
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
              <span>觉察标签</span>
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
              onClick={() => setActiveTab('meditationSettings')}
              style={{
                padding: '12px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: activeTab === 'meditationSettings' ? '#2196F3' : 'transparent',
                color: activeTab === 'meditationSettings' ? '#fff' : '#666',
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
              <span>福豆奖励</span>
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
          <UserList 
            users={users} 
            onEditUser={handleEditUser}
            onManageTags={handleManageTags}
          />
        )}

        {/* Statistics Tab */}
        {!loading && !error && activeTab === 'statistics' && (
          <TagStatistics 
            users={users} 
            tagCategories={categories}
          />
        )}

        {/* Tag Management Tab */}
        {!loading && !error && activeTab === 'tagManagement' && (
          <TagManagement
            users={users}
            tagCategories={categories}
            tags={tags}
            onUpdateCategories={handleUpdateCategories}
            onUpdateTags={handleUpdateTags}
          />
        )}

        {!loading && !error && activeTab === 'meditationSettings' && (
          <MeditationSettings
            key={`${meditationSettings.documentId || 'default'}-${meditationSettings.rewardPoints}-${String(meditationSettings.allowRepeatRewards)}-${meditationSettings.inviterRewardRate || 0}`}
            settings={meditationSettings}
            error={settingsError}
            saving={savingMeditationSettings}
            onSave={handleSaveMeditationSettings}
          />
        )}

        {!loading && !error && activeTab === 'awarenessTags' && (
          <AwarenessTagSettings
            key={`${awarenessTagSettings.documentId || 'default'}-${awarenessTagOverview.length}`}
            tags={awarenessTagOverview}
            settings={awarenessTagSettings}
            error={settingsError}
            saving={savingAwarenessTagSettings}
            onSave={handleSaveAwarenessTagSettings}
          />
        )}

        {!loading && !error && activeTab === 'shop' && (
          <ShopManagement
            categories={shopCategories}
            products={shopProducts}
            skus={shopSkus}
            orders={shopOrders}
            orderItems={shopOrderItems}
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
