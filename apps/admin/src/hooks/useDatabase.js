import { useCallback, useEffect, useState } from 'react';
import DatabaseService, {
  DEFAULT_AWARENESS_TAG_SETTINGS,
  DEFAULT_BADGE_SETTINGS,
  DEFAULT_BRAND_CAROUSEL,
  DEFAULT_MEDITATION_SETTINGS,
  DEFAULT_STUDENT_MEMBERSHIP_SETTINGS,
  DEFAULT_THEME_SETTINGS,
  DEFAULT_USER_AVATAR_OPTIONS
} from '../services/database.js';
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
  const [awarenessTagSettings, setAwarenessTagSettings] = useState(DEFAULT_AWARENESS_TAG_SETTINGS);
  const [badgeSettings, setBadgeSettings] = useState(DEFAULT_BADGE_SETTINGS);
  const [themeSettings, setThemeSettings] = useState(DEFAULT_THEME_SETTINGS);
  const [brandCarouselSettings, setBrandCarouselSettings] = useState(DEFAULT_BRAND_CAROUSEL);
  const [userAvatarOptionsSettings, setUserAvatarOptionsSettings] = useState(DEFAULT_USER_AVATAR_OPTIONS);
  const [studentMembershipSettings, setStudentMembershipSettings] = useState(DEFAULT_STUDENT_MEMBERSHIP_SETTINGS);
  const [awarenessTagOverview, setAwarenessTagOverview] = useState([]);
  const [shopCategories, setShopCategories] = useState([]);
  const [shopProducts, setShopProducts] = useState([]);
  const [shopSkus, setShopSkus] = useState([]);
  const [shopOrders, setShopOrders] = useState([]);
  const [shopOrderItems, setShopOrderItems] = useState([]);
  const [settingsError, setSettingsError] = useState(null);
  const [savingMeditationSettings, setSavingMeditationSettings] = useState(false);
  const [savingAwarenessTagSettings, setSavingAwarenessTagSettings] = useState(false);
  const [savingBadgeSettings, setSavingBadgeSettings] = useState(false);
  const [savingThemeSettings, setSavingThemeSettings] = useState(false);
  const [savingBrandCarouselSettings, setSavingBrandCarouselSettings] = useState(false);
  const [savingUserAvatarOptionsSettings, setSavingUserAvatarOptionsSettings] = useState(false);
  const [savingStudentMembershipSettings, setSavingStudentMembershipSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all data from database
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashboardData, nextMeditationSettings, nextAwarenessTagSettings, nextBadgeSettings, nextThemeSettings, nextBrandCarouselSettings, nextUserAvatarOptionsSettings, nextStudentMembershipSettings, nextAwarenessTagOverview, nextShopManagementData] = await Promise.all([
        DatabaseService.getDashboardData(),
        DatabaseService.getMeditationSettings(),
        DatabaseService.getAwarenessTagSettings(),
        DatabaseService.getBadgeSettings(),
        DatabaseService.getThemeSettings(),
        DatabaseService.getBrandCarouselSettings(),
        DatabaseService.getUserAvatarOptionsSettings(),
        DatabaseService.getStudentMembershipSettings(),
        DatabaseService.getAwarenessTagOverview(),
        DatabaseService.getShopManagementData()
      ]);

      setUsers(dashboardData.users);
      setTags(dashboardData.tags);
      setCategories(dashboardData.categories);
      setMeditationSettings(nextMeditationSettings);
      setAwarenessTagSettings(nextAwarenessTagSettings);
      setBadgeSettings(nextBadgeSettings);
      setThemeSettings(nextThemeSettings);
      setBrandCarouselSettings(nextBrandCarouselSettings);
      setUserAvatarOptionsSettings(nextUserAvatarOptionsSettings);
      setStudentMembershipSettings(nextStudentMembershipSettings);
      setAwarenessTagOverview(nextAwarenessTagOverview);
      setShopCategories(nextShopManagementData.categories);
      setShopProducts(nextShopManagementData.products);
      setShopSkus(nextShopManagementData.skus);
      setShopOrders(nextShopManagementData.orders);
      setShopOrderItems(nextShopManagementData.orderItems);
      setSettingsError(
        nextMeditationSettings.missingCollection || nextAwarenessTagSettings.missingCollection || nextBadgeSettings.missingCollection || nextThemeSettings.missingCollection || nextBrandCarouselSettings.missingCollection || nextUserAvatarOptionsSettings.missingCollection || nextStudentMembershipSettings.missingCollection
          ? '当前使用默认配置。若要在后台保存设置，请先创建集合：app_settings。'
          : null
      );
    } catch (err) {
      console.error('Error loading dashboard data from CloudBase:', err);
      setError(getSetupErrorMessage(err));
      setUsers([]);
      setTags([]);
      setCategories([]);
      setMeditationSettings(DEFAULT_MEDITATION_SETTINGS);
      setAwarenessTagSettings(DEFAULT_AWARENESS_TAG_SETTINGS);
      setBadgeSettings(DEFAULT_BADGE_SETTINGS);
      setThemeSettings(DEFAULT_THEME_SETTINGS);
      setBrandCarouselSettings(DEFAULT_BRAND_CAROUSEL);
      setUserAvatarOptionsSettings(DEFAULT_USER_AVATAR_OPTIONS);
      setStudentMembershipSettings(DEFAULT_STUDENT_MEMBERSHIP_SETTINGS);
      setAwarenessTagOverview([]);
      setShopCategories([]);
      setShopProducts([]);
      setShopSkus([]);
      setShopOrders([]);
      setShopOrderItems([]);
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
      setAwarenessTagSettings(DEFAULT_AWARENESS_TAG_SETTINGS);
      setBadgeSettings(DEFAULT_BADGE_SETTINGS);
      setThemeSettings(DEFAULT_THEME_SETTINGS);
      setBrandCarouselSettings(DEFAULT_BRAND_CAROUSEL);
      setUserAvatarOptionsSettings(DEFAULT_USER_AVATAR_OPTIONS);
      setStudentMembershipSettings(DEFAULT_STUDENT_MEMBERSHIP_SETTINGS);
      setAwarenessTagOverview([]);
      setShopCategories([]);
      setShopProducts([]);
      setShopSkus([]);
      setShopOrders([]);
      setShopOrderItems([]);
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

  const updateAwarenessTagSettings = async (settingsData) => {
    try {
      setSavingAwarenessTagSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveAwarenessTagSettings(settingsData);
      setAwarenessTagSettings(savedSettings);
      setAwarenessTagOverview(await DatabaseService.getAwarenessTagOverview());
      return savedSettings;
    } catch (err) {
      console.error('Error updating awareness tag settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingAwarenessTagSettings(false);
    }
  };

  const updateBadgeSettings = async (settingsData) => {
    try {
      setSavingBadgeSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveBadgeSettings(settingsData);
      setBadgeSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating badge settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingBadgeSettings(false);
    }
  };

  const updateThemeSettings = async (settingsData) => {
    try {
      setSavingThemeSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveThemeSettings(settingsData);
      setThemeSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating theme settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingThemeSettings(false);
    }
  };

  const updateBrandCarouselSettings = async (settingsData) => {
    try {
      setSavingBrandCarouselSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveBrandCarouselSettings(settingsData);
      setBrandCarouselSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating brand carousel settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingBrandCarouselSettings(false);
    }
  };

  const updateUserAvatarOptionsSettings = async (settingsData) => {
    try {
      setSavingUserAvatarOptionsSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveUserAvatarOptionsSettings(settingsData);
      setUserAvatarOptionsSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating user avatar options settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingUserAvatarOptionsSettings(false);
    }
  };

  const updateStudentMembershipSettings = async (settingsData) => {
    try {
      setSavingStudentMembershipSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveStudentMembershipSettings(settingsData);
      setStudentMembershipSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating student membership settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingStudentMembershipSettings(false);
    }
  };

  const saveShopProduct = async (productData) => {
    try {
      await DatabaseService.saveShopProduct(productData);
      await loadData();
    } catch (err) {
      console.error('Error saving shop product:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const updateShopOrderStatus = async (orderId, nextStatus) => {
    try {
      await DatabaseService.updateShopOrderStatus(orderId, nextStatus);
      await loadData();
    } catch (err) {
      console.error('Error updating shop order status:', err);
      setError(getSetupErrorMessage(err));
      throw err;
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
    updateAwarenessTagSettings,
    updateBadgeSettings,
    updateThemeSettings,
    updateBrandCarouselSettings,
    updateUserAvatarOptionsSettings,
    updateStudentMembershipSettings,
    saveShopProduct,
    updateShopOrderStatus,
    initializeDatabase,
    
    // Utility
    refresh: loadData
  };
};
