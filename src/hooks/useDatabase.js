import { useCallback, useEffect, useState } from 'react';
import DatabaseService, { DEFAULT_MEDITATION_SETTINGS } from '../services/database.js';
import DatabaseInitializer from '../services/databaseInit.js';

const getSetupErrorMessage = (error) => {
  const rawMessage = error?.message || 'Unknown CloudBase error';

  if (rawMessage.includes('DATABASE_COLLECTION_NOT_EXIST') || rawMessage.includes('Db or Table not exist')) {
    return [
      'CloudBase 已连接，但当前环境缺少 Dashboard 所需集合。',
      '请先在 CloudBase 控制台创建这些集合：users、tag_categories、tags、user_tags。',
      '创建后还需要为这些集合配置可读写权限，否则前端匿名登录后仍然无法访问。'
    ].join(' ');
  }

  return rawMessage;
};

export const useDatabase = () => {
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [meditationSettings, setMeditationSettings] = useState(DEFAULT_MEDITATION_SETTINGS);
  const [settingsError, setSettingsError] = useState(null);
  const [savingMeditationSettings, setSavingMeditationSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all data from database
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashboardData, nextMeditationSettings] = await Promise.all([
        DatabaseService.getDashboardData(),
        DatabaseService.getMeditationSettings()
      ]);

      setUsers(dashboardData.users);
      setTags(dashboardData.tags);
      setCategories(dashboardData.categories);
      setMeditationSettings(nextMeditationSettings);
      setSettingsError(
        nextMeditationSettings.missingCollection
          ? '当前使用默认冥想奖励配置。若要在后台保存设置，请先创建集合：app_settings。'
          : null
      );
    } catch (err) {
      console.error('Error loading dashboard data from CloudBase:', err);
      setError(getSetupErrorMessage(err));
      setUsers([]);
      setTags([]);
      setCategories([]);
      setMeditationSettings(DEFAULT_MEDITATION_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize database and migrate data
  const initializeDatabase = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // First verify database connection
      const connectionCheck = await DatabaseInitializer.verifyConnection();
      if (!connectionCheck.connected) {
        throw new Error(connectionCheck.error || 'CloudBase connection failed');
      }

      await loadData();
    } catch (err) {
      console.error('Error initializing database:', err);
      setError(getSetupErrorMessage(err));
      setUsers([]);
      setTags([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [loadData]);

  // User operations
  const updateUser = async (userId, userData) => {
    try {
      await DatabaseService.updateUser(userId, userData);
      await loadData(); // Reload data
    } catch (err) {
      console.error('Error updating user:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  // Category operations
  const updateCategory = async (categoryUpdate) => {
    try {
      if (categoryUpdate.action === 'delete') {
        await DatabaseService.deleteCategory(categoryUpdate.id);
      } else {
        await DatabaseService.updateCategory(categoryUpdate.id, categoryUpdate);
      }
      await loadData(); // Reload data
    } catch (err) {
      console.error('Error updating category:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const createCategory = async (categoryData) => {
    try {
      await DatabaseService.createCategory(categoryData);
      await loadData(); // Reload data
    } catch (err) {
      console.error('Error creating category:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  // Tag operations
  const updateTag = async (tagUpdate) => {
    try {
      if (tagUpdate.action === 'delete') {
        await DatabaseService.deleteTag(tagUpdate.id);
      } else {
        await DatabaseService.updateTag(tagUpdate.id, tagUpdate);
      }
      await loadData(); // Reload data
    } catch (err) {
      console.error('Error updating tag:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const createTag = async (tagData) => {
    try {
      await DatabaseService.createTag(tagData);
      await loadData(); // Reload data
    } catch (err) {
      console.error('Error creating tag:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  // User tag operations
  const updateUserTags = async (userId, newTags) => {
    try {
      const tagIds = newTags.map(tag => tag.id);
      await DatabaseService.updateUserTags(userId, tagIds);
      await loadData(); // Reload data
    } catch (err) {
      console.error('Error updating user tags:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  // Get user tags with full tag details
  const getUserTags = async (userId) => {
    try {
      return await DatabaseService.getUserTags(userId);
    } catch (err) {
      console.error('Error getting user tags:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const updateMeditationSettings = async (settingsData) => {
    try {
      setSavingMeditationSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveMeditationSettings(settingsData);
      setMeditationSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating meditation settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingMeditationSettings(false);
    }
  };

  // Initialize on mount
  useEffect(() => {
    void initializeDatabase();
  }, [initializeDatabase]);

  return {
    // Data
    users,
    tags,
    categories,
    meditationSettings,
    settingsError,
    savingMeditationSettings,
    loading,
    error,
    
    // Operations
    loadData,
    updateUser,
    updateCategory,
    createCategory,
    updateTag,
    createTag,
    updateUserTags,
    getUserTags,
    updateMeditationSettings,
    initializeDatabase,
    
    // Utility
    refresh: loadData
  };
};
