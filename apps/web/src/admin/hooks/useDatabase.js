import { useCallback, useEffect, useState } from 'react';
import DatabaseService, {
  DEFAULT_AWARENESS_TAG_SETTINGS,
  DEFAULT_AWARENESS_DISPLAY,
  DEFAULT_BADGE_SETTINGS,
  DEFAULT_BRAND_CAROUSEL,
  DEFAULT_CLIENT_DISTRIBUTION_SETTINGS,
  DEFAULT_MEDITATION_SETTINGS,
  DEFAULT_MEDITATION_AUDIO_LIBRARY,
  DEFAULT_MEDITATION_COMPOSITION_SETTINGS,
  DEFAULT_MEDITATION_CALENDAR,
  DEFAULT_MEDITATION_LIBRARY,
  DEFAULT_PAGE_MASTHEAD,
  DEFAULT_SHOP_PARTNER_PRICING,
  DEFAULT_SHOP_HOME_LIVING_SETTINGS,
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

const isTransientNetworkIssue = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('network request error') || message.includes('timeout');
};

const wait = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const runWithRetry = async (requestFactory, { retries = 2, delayMs = 250 } = {}) => {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestFactory();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkIssue(error) || attempt === retries) {
        throw error;
      }

      await wait(delayMs * (attempt + 1));
    }
  }

  throw lastError;
};

export const useDatabase = () => {
  const EMPTY_OVERVIEW_STATS = {
    awarenessDailyCounts: [],
    meditationDailyCounts: [],
    meditationDailyDurationMinutes: []
  };
  const EMPTY_DASHBOARD_DATA = {
    users: [],
    tags: [],
    categories: [],
    overviewStats: EMPTY_OVERVIEW_STATS
  };
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [overviewStats, setOverviewStats] = useState(EMPTY_OVERVIEW_STATS);
  const [meditationSettings, setMeditationSettings] = useState(DEFAULT_MEDITATION_SETTINGS);
  const [awarenessTagSettings, setAwarenessTagSettings] = useState(DEFAULT_AWARENESS_TAG_SETTINGS);
  const [awarenessDisplaySettings, setAwarenessDisplaySettings] = useState(DEFAULT_AWARENESS_DISPLAY);
  const [badgeSettings, setBadgeSettings] = useState(DEFAULT_BADGE_SETTINGS);
  const [themeSettings, setThemeSettings] = useState(DEFAULT_THEME_SETTINGS);
  const [brandCarouselSettings, setBrandCarouselSettings] = useState(DEFAULT_BRAND_CAROUSEL);
  const [userAvatarOptionsSettings, setUserAvatarOptionsSettings] = useState(DEFAULT_USER_AVATAR_OPTIONS);
  const [clientDistributionSettings, setClientDistributionSettings] = useState(DEFAULT_CLIENT_DISTRIBUTION_SETTINGS);
  const [pageMastheadSettings, setPageMastheadSettings] = useState(DEFAULT_PAGE_MASTHEAD);
  const [shopHomeLivingSettings, setShopHomeLivingSettings] = useState(DEFAULT_SHOP_HOME_LIVING_SETTINGS);
  const [shopPartnerPricingSettings, setShopPartnerPricingSettings] = useState(DEFAULT_SHOP_PARTNER_PRICING);
  const [studentMembershipSettings, setStudentMembershipSettings] = useState(DEFAULT_STUDENT_MEMBERSHIP_SETTINGS);
  const [awarenessTagOverview, setAwarenessTagOverview] = useState([]);
  const [meditationAudioLibrary, setMeditationAudioLibrary] = useState(DEFAULT_MEDITATION_AUDIO_LIBRARY);
  const [meditationCompositionSettings, setMeditationCompositionSettings] = useState(DEFAULT_MEDITATION_COMPOSITION_SETTINGS);
  const [meditationCalendar, setMeditationCalendar] = useState(DEFAULT_MEDITATION_CALENDAR);
  const [meditationLibrary, setMeditationLibrary] = useState(DEFAULT_MEDITATION_LIBRARY);
  const [savingMeditationAudioLibrary, setSavingMeditationAudioLibrary] = useState(false);
  const [savingMeditationCompositionSettings, setSavingMeditationCompositionSettings] = useState(false);
  const [savingMeditationCalendar, setSavingMeditationCalendar] = useState(false);
  const [savingMeditationLibrary, setSavingMeditationLibrary] = useState(false);
  const [shopCategories, setShopCategories] = useState([]);
  const [shopProducts, setShopProducts] = useState([]);
  const [shopSkus, setShopSkus] = useState([]);
  const [shopOrders, setShopOrders] = useState([]);
  const [shopOrderItems, setShopOrderItems] = useState([]);
  const [partnerOrders, setPartnerOrders] = useState([]);
  const [partnerSubOrders, setPartnerSubOrders] = useState([]);
  const [settingsError, setSettingsError] = useState(null);
  const [savingMeditationSettings, setSavingMeditationSettings] = useState(false);
  const [savingAwarenessTagSettings, setSavingAwarenessTagSettings] = useState(false);
  const [savingAwarenessDisplaySettings, setSavingAwarenessDisplaySettings] = useState(false);
  const [savingBadgeSettings, setSavingBadgeSettings] = useState(false);
  const [savingThemeSettings, setSavingThemeSettings] = useState(false);
  const [savingBrandCarouselSettings, setSavingBrandCarouselSettings] = useState(false);
  const [savingUserAvatarOptionsSettings, setSavingUserAvatarOptionsSettings] = useState(false);
  const [savingClientDistributionSettings, setSavingClientDistributionSettings] = useState(false);
  const [savingPageMastheadSettings, setSavingPageMastheadSettings] = useState(false);
  const [savingShopHomeLivingSettings, setSavingShopHomeLivingSettings] = useState(false);
  const [savingShopPartnerPricingSettings, setSavingShopPartnerPricingSettings] = useState(false);
  const [savingStudentMembershipSettings, setSavingStudentMembershipSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all data from database
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const runSettledBatch = async (requestFactories) => Promise.all(
        requestFactories.map(async (requestFactory) => {
          try {
            const value = await runWithRetry(requestFactory);
            return { status: 'fulfilled', value };
          } catch (reason) {
            return { status: 'rejected', reason };
          }
        })
      );

      const [
        dashboardDataResult,
        meditationSettingsResult,
        awarenessTagSettingsResult,
        awarenessDisplaySettingsResult,
        badgeSettingsResult
      ] = await runSettledBatch([
        () => DatabaseService.getDashboardData(),
        () => DatabaseService.getMeditationSettings(),
        () => DatabaseService.getAwarenessTagSettings(),
        () => DatabaseService.getAwarenessDisplaySettings(),
        () => DatabaseService.getBadgeSettings()
      ]);

      const [
        themeSettingsResult,
        brandCarouselSettingsResult,
        userAvatarOptionsSettingsResult,
        clientDistributionSettingsResult,
        pageMastheadSettingsResult
      ] = await runSettledBatch([
        () => DatabaseService.getThemeSettings(),
        () => DatabaseService.getBrandCarouselSettings(),
        () => DatabaseService.getUserAvatarOptionsSettings(),
        () => DatabaseService.getClientDistributionSettings(),
        () => DatabaseService.getPageMastheadSettings()
      ]);

      const [
        shopHomeLivingSettingsResult,
        shopPartnerPricingSettingsResult,
        studentMembershipSettingsResult,
        awarenessTagOverviewResult,
        shopManagementDataResult
      ] = await runSettledBatch([
        () => DatabaseService.getShopHomeLivingSettings(),
        () => DatabaseService.getShopPartnerPricingSettings(),
        () => DatabaseService.getStudentMembershipSettings(),
        () => DatabaseService.getAwarenessTagOverview(),
        () => DatabaseService.getShopManagementData()
      ]);

      const [
        partnerOrderDataResult,
        meditationAudioLibraryResult,
        meditationCompositionSettingsResult,
        meditationCalendarResult,
        meditationLibraryResult
      ] = await runSettledBatch([
        () => DatabaseService.getPartnerOrderData(),
        () => DatabaseService.getMeditationAudioLibrary(),
        () => DatabaseService.getMeditationCompositionSettings(),
        () => DatabaseService.getMeditationCalendar(),
        () => DatabaseService.getMeditationLibrary()
      ]);

      const dashboardData = dashboardDataResult.status === 'fulfilled' ? dashboardDataResult.value : EMPTY_DASHBOARD_DATA;
      const nextMeditationSettings = meditationSettingsResult.status === 'fulfilled' ? meditationSettingsResult.value : DEFAULT_MEDITATION_SETTINGS;
      const nextAwarenessTagSettings = awarenessTagSettingsResult.status === 'fulfilled' ? awarenessTagSettingsResult.value : DEFAULT_AWARENESS_TAG_SETTINGS;
      const nextAwarenessDisplaySettings = awarenessDisplaySettingsResult.status === 'fulfilled' ? awarenessDisplaySettingsResult.value : DEFAULT_AWARENESS_DISPLAY;
      const nextBadgeSettings = badgeSettingsResult.status === 'fulfilled' ? badgeSettingsResult.value : DEFAULT_BADGE_SETTINGS;
      const nextThemeSettings = themeSettingsResult.status === 'fulfilled' ? themeSettingsResult.value : DEFAULT_THEME_SETTINGS;
      const nextBrandCarouselSettings = brandCarouselSettingsResult.status === 'fulfilled' ? brandCarouselSettingsResult.value : DEFAULT_BRAND_CAROUSEL;
      const nextUserAvatarOptionsSettings = userAvatarOptionsSettingsResult.status === 'fulfilled' ? userAvatarOptionsSettingsResult.value : DEFAULT_USER_AVATAR_OPTIONS;
      const nextClientDistributionSettings = clientDistributionSettingsResult.status === 'fulfilled' ? clientDistributionSettingsResult.value : DEFAULT_CLIENT_DISTRIBUTION_SETTINGS;
      const nextPageMastheadSettings = pageMastheadSettingsResult.status === 'fulfilled' ? pageMastheadSettingsResult.value : DEFAULT_PAGE_MASTHEAD;
      const nextShopHomeLivingSettings = shopHomeLivingSettingsResult.status === 'fulfilled' ? shopHomeLivingSettingsResult.value : DEFAULT_SHOP_HOME_LIVING_SETTINGS;
      const nextShopPartnerPricingSettings = shopPartnerPricingSettingsResult.status === 'fulfilled' ? shopPartnerPricingSettingsResult.value : DEFAULT_SHOP_PARTNER_PRICING;
      const nextStudentMembershipSettings = studentMembershipSettingsResult.status === 'fulfilled' ? studentMembershipSettingsResult.value : DEFAULT_STUDENT_MEMBERSHIP_SETTINGS;
      const nextAwarenessTagOverview = awarenessTagOverviewResult.status === 'fulfilled' ? awarenessTagOverviewResult.value : [];
      const nextShopManagementData = shopManagementDataResult.status === 'fulfilled'
        ? shopManagementDataResult.value
        : { categories: [], products: [], skus: [], orders: [], orderItems: [] };
      const nextPartnerOrderData = partnerOrderDataResult.status === 'fulfilled'
        ? partnerOrderDataResult.value
        : { orders: [], subOrders: [] };
      const nextMeditationAudioLibrary = meditationAudioLibraryResult.status === 'fulfilled' ? meditationAudioLibraryResult.value : DEFAULT_MEDITATION_AUDIO_LIBRARY;
      const nextMeditationCompositionSettings = meditationCompositionSettingsResult.status === 'fulfilled' ? meditationCompositionSettingsResult.value : DEFAULT_MEDITATION_COMPOSITION_SETTINGS;
      const nextMeditationCalendar = meditationCalendarResult.status === 'fulfilled' ? meditationCalendarResult.value : DEFAULT_MEDITATION_CALENDAR;
      const nextMeditationLibrary = meditationLibraryResult.status === 'fulfilled' ? meditationLibraryResult.value : DEFAULT_MEDITATION_LIBRARY;

      setUsers(dashboardData.users);
      setTags(dashboardData.tags);
      setCategories(dashboardData.categories);
      setOverviewStats(dashboardData.overviewStats || EMPTY_OVERVIEW_STATS);
      setMeditationSettings(nextMeditationSettings);
      setAwarenessTagSettings(nextAwarenessTagSettings);
      setAwarenessDisplaySettings(nextAwarenessDisplaySettings);
      setBadgeSettings(nextBadgeSettings);
      setThemeSettings(nextThemeSettings);
      setBrandCarouselSettings(nextBrandCarouselSettings);
      setUserAvatarOptionsSettings(nextUserAvatarOptionsSettings);
      setClientDistributionSettings(nextClientDistributionSettings);
      setPageMastheadSettings(nextPageMastheadSettings);
      setShopHomeLivingSettings(nextShopHomeLivingSettings);
      setShopPartnerPricingSettings(nextShopPartnerPricingSettings);
      setStudentMembershipSettings(nextStudentMembershipSettings);
      setAwarenessTagOverview(nextAwarenessTagOverview);
      setShopCategories(nextShopManagementData.categories);
      setShopProducts(nextShopManagementData.products);
      setShopSkus(nextShopManagementData.skus);
      setShopOrders(nextShopManagementData.orders);
      setShopOrderItems(nextShopManagementData.orderItems);
      setPartnerOrders(nextPartnerOrderData.orders);
      setPartnerSubOrders(nextPartnerOrderData.subOrders);
      setMeditationAudioLibrary(nextMeditationAudioLibrary);
      setMeditationCompositionSettings(nextMeditationCompositionSettings);
      setMeditationCalendar(nextMeditationCalendar);
      setMeditationLibrary(nextMeditationLibrary);
      const missingCollectionWarning =
        nextMeditationSettings.missingCollection || nextAwarenessTagSettings.missingCollection || nextAwarenessDisplaySettings.missingCollection || nextBadgeSettings.missingCollection || nextThemeSettings.missingCollection || nextBrandCarouselSettings.missingCollection || nextUserAvatarOptionsSettings.missingCollection || nextClientDistributionSettings.missingCollection || nextPageMastheadSettings.missingCollection || nextShopHomeLivingSettings.missingCollection || nextShopPartnerPricingSettings.missingCollection || nextStudentMembershipSettings.missingCollection;

      const partialFailureLabels = [
        dashboardDataResult.status === 'rejected' ? '总览与用户' : '',
        meditationSettingsResult.status === 'rejected' ? '冥想设置' : '',
        awarenessTagSettingsResult.status === 'rejected' ? '觉察标签设置' : '',
        awarenessDisplaySettingsResult.status === 'rejected' ? '觉察显示设置' : '',
        badgeSettingsResult.status === 'rejected' ? '徽章设置' : '',
        themeSettingsResult.status === 'rejected' ? '主题设置' : '',
        brandCarouselSettingsResult.status === 'rejected' ? '首页轮播' : '',
        userAvatarOptionsSettingsResult.status === 'rejected' ? '用户头像' : '',
        clientDistributionSettingsResult.status === 'rejected' ? '版本分发' : '',
        pageMastheadSettingsResult.status === 'rejected' ? 'PageMasthead' : '',
        shopHomeLivingSettingsResult.status === 'rejected' ? '我的居心地' : '',
        shopPartnerPricingSettingsResult.status === 'rejected' ? '代理商折扣' : '',
        studentMembershipSettingsResult.status === 'rejected' ? '学员设置' : '',
        awarenessTagOverviewResult.status === 'rejected' ? '觉察统计' : '',
        shopManagementDataResult.status === 'rejected' ? '工坊数据' : '',
        partnerOrderDataResult.status === 'rejected' ? '合作伙伴订单' : '',
        meditationAudioLibraryResult.status === 'rejected' ? '冥想音频库' : '',
        meditationCompositionSettingsResult.status === 'rejected' ? '冥想编排' : '',
        meditationCalendarResult.status === 'rejected' ? '冥想日历' : '',
        meditationLibraryResult.status === 'rejected' ? '冥想库' : ''
      ].filter(Boolean);

      setSettingsError(
        missingCollectionWarning
          ? '当前使用默认配置。若要在后台保存设置，请先创建集合：app_settings。'
          : partialFailureLabels.length > 0
            ? `部分管理数据加载失败，已使用默认值：${partialFailureLabels.join('、')}`
            : null
      );
    } catch (err) {
      console.error('Error loading dashboard data from CloudBase:', err);
      setError(getSetupErrorMessage(err));
      setUsers([]);
      setTags([]);
      setCategories([]);
      setOverviewStats(EMPTY_OVERVIEW_STATS);
      setMeditationSettings(DEFAULT_MEDITATION_SETTINGS);
      setAwarenessTagSettings(DEFAULT_AWARENESS_TAG_SETTINGS);
      setAwarenessDisplaySettings(DEFAULT_AWARENESS_DISPLAY);
      setBadgeSettings(DEFAULT_BADGE_SETTINGS);
      setThemeSettings(DEFAULT_THEME_SETTINGS);
      setBrandCarouselSettings(DEFAULT_BRAND_CAROUSEL);
      setUserAvatarOptionsSettings(DEFAULT_USER_AVATAR_OPTIONS);
      setClientDistributionSettings(DEFAULT_CLIENT_DISTRIBUTION_SETTINGS);
      setPageMastheadSettings(DEFAULT_PAGE_MASTHEAD);
      setShopHomeLivingSettings(DEFAULT_SHOP_HOME_LIVING_SETTINGS);
      setShopPartnerPricingSettings(DEFAULT_SHOP_PARTNER_PRICING);
      setStudentMembershipSettings(DEFAULT_STUDENT_MEMBERSHIP_SETTINGS);
      setAwarenessTagOverview([]);
      setShopCategories([]);
      setShopProducts([]);
      setShopSkus([]);
      setShopOrders([]);
      setShopOrderItems([]);
      setPartnerOrders([]);
      setPartnerSubOrders([]);
      setMeditationAudioLibrary(DEFAULT_MEDITATION_AUDIO_LIBRARY);
      setMeditationCompositionSettings(DEFAULT_MEDITATION_COMPOSITION_SETTINGS);
      setMeditationCalendar(DEFAULT_MEDITATION_CALENDAR);
      setMeditationLibrary(DEFAULT_MEDITATION_LIBRARY);
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

      await DatabaseService.ensureSystemRoleTags();
      await DatabaseService.ensureBrandScopeTagsAndShopCategories();
      await DatabaseService.ensureBrandRoleModel();
      await loadData();
    } catch (err) {
      console.error('Error initializing database:', err);
      setError(getSetupErrorMessage(err));
      setUsers([]);
      setTags([]);
      setCategories([]);
      setOverviewStats({
        awarenessDailyCounts: [],
        meditationDailyCounts: [],
        meditationDailyDurationMinutes: []
      });
      setAwarenessTagSettings(DEFAULT_AWARENESS_TAG_SETTINGS);
      setAwarenessDisplaySettings(DEFAULT_AWARENESS_DISPLAY);
      setBadgeSettings(DEFAULT_BADGE_SETTINGS);
      setThemeSettings(DEFAULT_THEME_SETTINGS);
      setBrandCarouselSettings(DEFAULT_BRAND_CAROUSEL);
      setUserAvatarOptionsSettings(DEFAULT_USER_AVATAR_OPTIONS);
      setClientDistributionSettings(DEFAULT_CLIENT_DISTRIBUTION_SETTINGS);
      setPageMastheadSettings(DEFAULT_PAGE_MASTHEAD);
      setShopHomeLivingSettings(DEFAULT_SHOP_HOME_LIVING_SETTINGS);
      setShopPartnerPricingSettings(DEFAULT_SHOP_PARTNER_PRICING);
      setStudentMembershipSettings(DEFAULT_STUDENT_MEMBERSHIP_SETTINGS);
      setAwarenessTagOverview([]);
      setShopCategories([]);
      setShopProducts([]);
      setShopSkus([]);
      setShopOrders([]);
      setShopOrderItems([]);
      setPartnerOrders([]);
      setPartnerSubOrders([]);
      setMeditationAudioLibrary(DEFAULT_MEDITATION_AUDIO_LIBRARY);
      setMeditationCompositionSettings(DEFAULT_MEDITATION_COMPOSITION_SETTINGS);
      setMeditationCalendar(DEFAULT_MEDITATION_CALENDAR);
      setMeditationLibrary(DEFAULT_MEDITATION_LIBRARY);
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

  const updateAwarenessDisplaySettings = async (settingsData) => {
    try {
      setSavingAwarenessDisplaySettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveAwarenessDisplaySettings(settingsData);
      setAwarenessDisplaySettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating awareness display settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingAwarenessDisplaySettings(false);
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

  const updateClientDistributionSettings = async (settingsData) => {
    try {
      setSavingClientDistributionSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveClientDistributionSettings(settingsData);
      setClientDistributionSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating client distribution settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingClientDistributionSettings(false);
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

  const updatePartnerSubOrderStatus = async (subOrderId, nextStatus) => {
    try {
      setSettingsError(null);
      await DatabaseService.updatePartnerSubOrderStatus(subOrderId, nextStatus);
      await loadData();
    } catch (err) {
      console.error('Error updating partner sub order status:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const updateShopPartnerPricingSettings = async (settingsData) => {
    try {
      setSavingShopPartnerPricingSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveShopPartnerPricingSettings(settingsData);
      setShopPartnerPricingSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating shop partner pricing settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingShopPartnerPricingSettings(false);
    }
  };

  const updateShopHomeLivingSettings = async (settingsData) => {
    try {
      setSavingShopHomeLivingSettings(true);
      setSettingsError(null);
      const savedSettings = await DatabaseService.saveShopHomeLivingSettings(settingsData);
      setShopHomeLivingSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating shop home living settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingShopHomeLivingSettings(false);
    }
  };

  const updatePageMastheadSettings = async (settingsData) => {
    try {
      setSavingPageMastheadSettings(true);
      setSettingsError(null);
      const savedSettings = await DatabaseService.savePageMastheadSettings(settingsData);
      setPageMastheadSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating page masthead settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingPageMastheadSettings(false);
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

  const updateMeditationAudioLibrary = async (data) => {
    try {
      setSavingMeditationAudioLibrary(true);
      setSettingsError(null);
      const saved = await DatabaseService.saveMeditationAudioLibrary(data);
      setMeditationAudioLibrary(saved);
      return saved;
    } catch (err) {
      console.error('Error updating meditation audio library:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingMeditationAudioLibrary(false);
    }
  };

  const updateMeditationCompositionSettings = async (data) => {
    try {
      setSavingMeditationCompositionSettings(true);
      setSettingsError(null);
      const saved = await DatabaseService.saveMeditationCompositionSettings(data);
      setMeditationCompositionSettings(saved);
      return saved;
    } catch (err) {
      console.error('Error updating meditation composition settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingMeditationCompositionSettings(false);
    }
  };

  const updateMeditationCalendar = async (data) => {
    try {
      setSavingMeditationCalendar(true);
      setSettingsError(null);
      const saved = await DatabaseService.saveMeditationCalendar(data);
      setMeditationCalendar(saved);
      return saved;
    } catch (err) {
      console.error('Error updating meditation calendar:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingMeditationCalendar(false);
    }
  };

  const updateMeditationLibrary = async (data) => {
    try {
      setSavingMeditationLibrary(true);
      setSettingsError(null);
      const saved = await DatabaseService.saveMeditationLibrary(data);
      setMeditationLibrary(saved);
      return saved;
    } catch (err) {
      console.error('Error updating meditation library:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingMeditationLibrary(false);
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
    overviewStats,
    meditationSettings,
    awarenessTagSettings,
    awarenessDisplaySettings,
    badgeSettings,
    themeSettings,
    brandCarouselSettings,
    userAvatarOptionsSettings,
    clientDistributionSettings,
    pageMastheadSettings,
    shopHomeLivingSettings,
    shopPartnerPricingSettings,
    studentMembershipSettings,
    awarenessTagOverview,
    shopCategories,
    shopProducts,
    shopSkus,
    shopOrders,
    shopOrderItems,
    partnerOrders,
    partnerSubOrders,
    meditationAudioLibrary,
    meditationCompositionSettings,
    meditationCalendar,
    meditationLibrary,
    settingsError,
    savingMeditationSettings,
    savingAwarenessTagSettings,
    savingAwarenessDisplaySettings,
    savingBadgeSettings,
    savingThemeSettings,
    savingBrandCarouselSettings,
    savingUserAvatarOptionsSettings,
    savingClientDistributionSettings,
    savingPageMastheadSettings,
    savingShopHomeLivingSettings,
    savingShopPartnerPricingSettings,
    savingStudentMembershipSettings,
    savingMeditationAudioLibrary,
    savingMeditationCompositionSettings,
    savingMeditationCalendar,
    savingMeditationLibrary,
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
    updateAwarenessDisplaySettings,
    updateBadgeSettings,
    updateThemeSettings,
    updateBrandCarouselSettings,
    updateUserAvatarOptionsSettings,
    updateClientDistributionSettings,
    updatePageMastheadSettings,
    updateShopHomeLivingSettings,
    updateShopPartnerPricingSettings,
    updateStudentMembershipSettings,
    updatePartnerSubOrderStatus,
    saveShopProduct,
    updateShopOrderStatus,
    updateMeditationAudioLibrary,
    updateMeditationCompositionSettings,
    updateMeditationCalendar,
    updateMeditationLibrary,
    initializeDatabase,

    // Utility
    refresh: loadData
  };
};
