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
  DEFAULT_PLATFORM_SERVICE_FEE,
  DEFAULT_SHOP_REWARD,
  DEFAULT_SYSTEM_FORTUNE,
  DEFAULT_SHOP_PARTNER_PRICING,
  DEFAULT_SHOP_HOME_LIVING_SETTINGS,
  DEFAULT_STUDENT_MEMBERSHIP_SETTINGS,
  DEFAULT_THEME_SETTINGS,
  DEFAULT_USER_AVATAR_OPTIONS
} from '../services/database.js';
import { getLatestCloudBaseProxyTrace } from '../services/cloudbase.js';

const getSetupErrorMessage = (error) => {
  const rawMessage = error?.message || 'Unknown CloudBase error';
  const proxyTrace = getLatestCloudBaseProxyTrace();
  const traceSuffix = proxyTrace?.requestId ? `（requestId: ${proxyTrace.requestId}）` : '';

  if (rawMessage.includes('DATABASE_COLLECTION_NOT_EXIST') || rawMessage.includes('Db or Table not exist')) {
    return [
      'CloudBase 已连接，但当前环境缺少 Dashboard 所需集合。',
      '请先在 CloudBase 控制台创建这些集合：users、tag_categories、tags、user_tags。',
      `创建后还需要为这些集合配置可读写权限，否则前端匿名登录后仍然无法访问。${traceSuffix}`
    ].join(' ');
  }

  return `${rawMessage}${traceSuffix}`;
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
    overviewStats: EMPTY_OVERVIEW_STATS,
    pointLedgerEntries: []
  };
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [overviewStats, setOverviewStats] = useState(EMPTY_OVERVIEW_STATS);
  const [pointLedgerEntries, setPointLedgerEntries] = useState([]);
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
  const [platformServiceFeeSettings, setPlatformServiceFeeSettings] = useState(DEFAULT_PLATFORM_SERVICE_FEE);
  const [shopRewardSettings, setShopRewardSettings] = useState(DEFAULT_SHOP_REWARD);
  const [systemFortuneSettings, setSystemFortuneSettings] = useState(DEFAULT_SYSTEM_FORTUNE);
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
  const [partnerUsers, setPartnerUsers] = useState([]);
  const [partnerBrands, setPartnerBrands] = useState([]);
  const [partnerBrandMembers, setPartnerBrandMembers] = useState([]);
  const [partnerBrandInvites, setPartnerBrandInvites] = useState([]);
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
  const [savingPlatformServiceFeeSettings, setSavingPlatformServiceFeeSettings] = useState(false);
  const [savingShopRewardSettings, setSavingShopRewardSettings] = useState(false);
  const [savingSystemFortuneSettings, setSavingSystemFortuneSettings] = useState(false);
  const [savingShopPartnerPricingSettings, setSavingShopPartnerPricingSettings] = useState(false);
  const [savingStudentMembershipSettings, setSavingStudentMembershipSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadedSections, setLoadedSections] = useState({
    overview: false,
    shop: false,
    fortune: false,
    meditation: false,
    settings: false,
    awareness: false
  });

  const loadOverviewData = useCallback(async () => {
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
        awarenessTagOverviewResult,
        shopManagementDataResult
      ] = await runSettledBatch([
        () => DatabaseService.getDashboardData(),
        () => DatabaseService.getAwarenessTagOverview(),
        () => DatabaseService.getShopManagementData()
      ]);

      const dashboardData = dashboardDataResult.status === 'fulfilled' ? dashboardDataResult.value : EMPTY_DASHBOARD_DATA;
      const nextAwarenessTagOverview = awarenessTagOverviewResult.status === 'fulfilled' ? awarenessTagOverviewResult.value : [];
      const nextShopManagementData = shopManagementDataResult.status === 'fulfilled'
        ? shopManagementDataResult.value
        : { categories: [], products: [], skus: [], orders: [], orderItems: [] };

      setUsers(dashboardData.users);
      setTags(dashboardData.tags);
      setCategories(dashboardData.categories);
      setOverviewStats(dashboardData.overviewStats || EMPTY_OVERVIEW_STATS);
      setPointLedgerEntries(dashboardData.pointLedgerEntries || []);
      setAwarenessTagOverview(nextAwarenessTagOverview);
      setShopCategories(nextShopManagementData.categories || []);
      setShopProducts(nextShopManagementData.products || []);
      setShopSkus(nextShopManagementData.skus || []);
      setShopOrders(nextShopManagementData.orders || []);
      setShopOrderItems(nextShopManagementData.orderItems || []);
      setLoadedSections((current) => ({ ...current, overview: true }));

      const partialFailureLabels = [
        dashboardDataResult.status === 'rejected' ? '总览与用户' : '',
        awarenessTagOverviewResult.status === 'rejected' ? '觉察统计' : '',
        shopManagementDataResult.status === 'rejected' ? '工坊数据' : ''
      ].filter(Boolean);

      setSettingsError(
        partialFailureLabels.length > 0
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
      setPointLedgerEntries([]);
      setThemeSettings(DEFAULT_THEME_SETTINGS);
      setBrandCarouselSettings(DEFAULT_BRAND_CAROUSEL);
      setUserAvatarOptionsSettings(DEFAULT_USER_AVATAR_OPTIONS);
      setClientDistributionSettings(DEFAULT_CLIENT_DISTRIBUTION_SETTINGS);
      setPageMastheadSettings(DEFAULT_PAGE_MASTHEAD);
      setShopHomeLivingSettings(DEFAULT_SHOP_HOME_LIVING_SETTINGS);
      setPlatformServiceFeeSettings(DEFAULT_PLATFORM_SERVICE_FEE);
      setShopRewardSettings(DEFAULT_SHOP_REWARD);
      setSystemFortuneSettings(DEFAULT_SYSTEM_FORTUNE);
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
      setPartnerUsers([]);
      setPartnerBrands([]);
      setPartnerBrandMembers([]);
      setPartnerBrandInvites([]);
      setMeditationAudioLibrary(DEFAULT_MEDITATION_AUDIO_LIBRARY);
      setMeditationCompositionSettings(DEFAULT_MEDITATION_COMPOSITION_SETTINGS);
      setMeditationCalendar(DEFAULT_MEDITATION_CALENDAR);
      setMeditationLibrary(DEFAULT_MEDITATION_LIBRARY);
      setLoadedSections({
        overview: false,
        shop: false,
        fortune: false,
        meditation: false,
        settings: false,
        awareness: false
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    await loadOverviewData();
  }, [loadOverviewData]);

  const loadAdminSection = useCallback(async (section, options = {}) => {
    const force = Boolean(options.force);
    if (!section || (!force && loadedSections[section])) {
      return;
    }

    try {
      setSettingsError(null);

      if (section === 'users') {
        const [studentMembership, nextUsers, nextTags, nextCategories] = await Promise.all([
          runWithRetry(() => DatabaseService.getStudentMembershipSettings()),
          runWithRetry(() => DatabaseService.getUsers()),
          runWithRetry(() => DatabaseService.getTags()),
          runWithRetry(() => DatabaseService.getTagCategories())
        ]);

        setStudentMembershipSettings(studentMembership);
        setUsers(nextUsers);
        setTags(nextTags);
        setCategories(nextCategories);
      }

      if (section === 'shop') {
        const [shopManagementData, partnerOrderData, partnerUsersData, partnerBrandWorkspace] = await Promise.all([
          runWithRetry(() => DatabaseService.getShopManagementData()),
          runWithRetry(() => DatabaseService.getPartnerOrderData()),
          runWithRetry(() => DatabaseService.getPartnerUsers()),
          runWithRetry(() => DatabaseService.getPartnerBrandWorkspaceData())
        ]);

        setShopCategories(shopManagementData.categories || []);
        setShopProducts(shopManagementData.products || []);
        setShopSkus(shopManagementData.skus || []);
        setShopOrders(shopManagementData.orders || []);
        setShopOrderItems(shopManagementData.orderItems || []);
        setPartnerOrders(partnerOrderData.orders || []);
        setPartnerSubOrders(partnerOrderData.subOrders || []);
        setPartnerUsers(partnerUsersData || []);
        setPartnerBrands(partnerBrandWorkspace.brands || []);
        setPartnerBrandMembers(partnerBrandWorkspace.members || []);
        setPartnerBrandInvites(partnerBrandWorkspace.invites || []);
      }

      if (section === 'fortune') {
        const [systemFortune, partnerUsersData, partnerBrandWorkspace] = await Promise.all([
          runWithRetry(() => DatabaseService.getSystemFortuneSettings()),
          runWithRetry(() => DatabaseService.getPartnerUsers()),
          runWithRetry(() => DatabaseService.getPartnerBrandWorkspaceData())
        ]);

        setSystemFortuneSettings(systemFortune);
        setPartnerUsers(partnerUsersData || []);
        setPartnerBrands(partnerBrandWorkspace.brands || []);
        setPartnerBrandMembers(partnerBrandWorkspace.members || []);
        setPartnerBrandInvites(partnerBrandWorkspace.invites || []);
      }

      if (section === 'settings') {
        const [
          meditation,
          awarenessDisplay,
          badge,
          theme,
          carousel,
          avatarOptions,
          distribution,
          masthead,
          homeLiving,
          platformFee,
          shopReward,
          shopPricing
        ] = await Promise.all([
          runWithRetry(() => DatabaseService.getMeditationSettings()),
          runWithRetry(() => DatabaseService.getAwarenessDisplaySettings()),
          runWithRetry(() => DatabaseService.getBadgeSettings()),
          runWithRetry(() => DatabaseService.getThemeSettings()),
          runWithRetry(() => DatabaseService.getBrandCarouselSettings()),
          runWithRetry(() => DatabaseService.getUserAvatarOptionsSettings()),
          runWithRetry(() => DatabaseService.getClientDistributionSettings()),
          runWithRetry(() => DatabaseService.getPageMastheadSettings()),
          runWithRetry(() => DatabaseService.getShopHomeLivingSettings()),
          runWithRetry(() => DatabaseService.getPlatformServiceFeeSettings()),
          runWithRetry(() => DatabaseService.getShopRewardSettings()),
          runWithRetry(() => DatabaseService.getShopPartnerPricingSettings())
        ]);

        setMeditationSettings(meditation);
        setAwarenessDisplaySettings(awarenessDisplay);
        setBadgeSettings(badge);
        setThemeSettings(theme);
        setBrandCarouselSettings(carousel);
        setUserAvatarOptionsSettings(avatarOptions);
        setClientDistributionSettings(distribution);
        setPageMastheadSettings(masthead);
        setShopHomeLivingSettings(homeLiving);
        setPlatformServiceFeeSettings(platformFee);
        setShopRewardSettings(shopReward);
        setShopPartnerPricingSettings(shopPricing);
      }

      if (section === 'awareness') {
        const [overview, settings, shopManagementData] = await Promise.all([
          runWithRetry(() => DatabaseService.getAwarenessTagOverview()),
          runWithRetry(() => DatabaseService.getAwarenessTagSettings()),
          runWithRetry(() => DatabaseService.getShopManagementData())
        ]);
        setAwarenessTagOverview(overview || []);
        setAwarenessTagSettings(settings);
        setShopProducts(shopManagementData.products || []);
      }

      if (section === 'meditation') {
        const [audioLibrary, compositionSettings, calendar, library] = await Promise.all([
          runWithRetry(() => DatabaseService.getMeditationAudioLibrary()),
          runWithRetry(() => DatabaseService.getMeditationCompositionSettings()),
          runWithRetry(() => DatabaseService.getMeditationCalendar()),
          runWithRetry(() => DatabaseService.getMeditationLibrary())
        ]);

        setMeditationAudioLibrary(audioLibrary);
        setMeditationCompositionSettings(compositionSettings);
        setMeditationCalendar(calendar);
        setMeditationLibrary(library);
      }

      setLoadedSections((current) => ({ ...current, [section]: true }));
    } catch (err) {
      console.error(`Error loading admin section ${section}:`, err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    }
  }, [loadedSections]);

  // Initialize admin dashboard
  const initializeDatabase = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      await loadOverviewData();
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
      setShopRewardSettings(DEFAULT_SHOP_REWARD);
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
      setLoadedSections({
        overview: false,
        shop: false,
        fortune: false,
        meditation: false,
        settings: false,
        awareness: false
      });
    } finally {
      setLoading(false);
    }
  }, [loadOverviewData]);

  // User operations
  const updateUser = async (userId, userData) => {
    try {
      await DatabaseService.updateUser(userId, userData);
      const refreshedUsers = await DatabaseService.getUsers();
      setUsers(refreshedUsers);
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
      const [nextCategories, nextTags] = await Promise.all([
        DatabaseService.getTagCategories(),
        DatabaseService.getTags()
      ]);
      setCategories(nextCategories);
      setTags(nextTags);
    } catch (err) {
      console.error('Error updating category:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const createCategory = async (categoryData) => {
    try {
      await DatabaseService.createCategory(categoryData);
      setCategories(await DatabaseService.getTagCategories());
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
      setTags(await DatabaseService.getTags());
    } catch (err) {
      console.error('Error updating tag:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const createTag = async (tagData) => {
    try {
      await DatabaseService.createTag(tagData);
      setTags(await DatabaseService.getTags());
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
      setUsers(await DatabaseService.getUsers());
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
      await loadAdminSection('shop', { force: true });
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

  const updatePlatformServiceFeeSettings = async (settingsData) => {
    try {
      setSavingPlatformServiceFeeSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.savePlatformServiceFeeSettings(settingsData);
      setPlatformServiceFeeSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating platform service fee settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingPlatformServiceFeeSettings(false);
    }
  };

  const updateShopRewardSettings = async (settingsData) => {
    try {
      setSavingShopRewardSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveShopRewardSettings(settingsData);
      setShopRewardSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating shop reward settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingShopRewardSettings(false);
    }
  };

  const updateSystemFortuneSettings = async (settingsData) => {
    try {
      setSavingSystemFortuneSettings(true);
      setSettingsError(null);

      const savedSettings = await DatabaseService.saveSystemFortuneSettings(settingsData);
      setSystemFortuneSettings(savedSettings);
      return savedSettings;
    } catch (err) {
      console.error('Error updating system fortune settings:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingSystemFortuneSettings(false);
    }
  };

  const updatePartnerBrandCommunityBeansBalance = async (brandId, nextBalance) => {
    try {
      setSettingsError(null);
      const currentBrand = partnerBrands.find((brand) => brand.id === brandId);
      if (!currentBrand) {
        throw new Error('未找到目标品牌店铺');
      }

      await DatabaseService.savePartnerBrand({
        ...currentBrand,
        id: currentBrand.id,
        communityBeansBalance: Math.max(0, Number(nextBalance) || 0)
      });

      const refreshedBrandWorkspace = await DatabaseService.getPartnerBrandWorkspaceData();
      setPartnerBrands(refreshedBrandWorkspace.brands || []);
      setPartnerBrandMembers(refreshedBrandWorkspace.members || []);
      setPartnerBrandInvites(refreshedBrandWorkspace.invites || []);
    } catch (err) {
      console.error('Error updating partner brand community beans balance:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const adjustUserBalanceWithSystemPool = async (userId, delta, options = {}) => {
    try {
      setSavingSystemFortuneSettings(true);
      setSettingsError(null);

      const result = await DatabaseService.adjustUserBalanceWithSystemPool(userId, delta, options);
      setUsers((currentUsers) => currentUsers.map((user) => (
        user.id === userId ? { ...user, balance: result.userBalance } : user
      )));
      setSystemFortuneSettings((current) => ({
        ...current,
        systemBeansBalance: result.systemBeansBalance
      }));
      return result;
    } catch (err) {
      console.error('Error adjusting user balance with system pool:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingSystemFortuneSettings(false);
    }
  };

  const adjustPartnerBrandCommunityBeansBalance = async (brandId, delta, options = {}) => {
    try {
      setSavingSystemFortuneSettings(true);
      setSettingsError(null);

      const result = await DatabaseService.adjustPartnerBrandCommunityBeansBalance(brandId, delta, options);
      const refreshedBrandWorkspace = await DatabaseService.getPartnerBrandWorkspaceData();
      setPartnerBrands(refreshedBrandWorkspace.brands || []);
      setPartnerBrandMembers(refreshedBrandWorkspace.members || []);
      setPartnerBrandInvites(refreshedBrandWorkspace.invites || []);
      setSystemFortuneSettings((current) => ({
        ...current,
        systemBeansBalance: result.systemBeansBalance
      }));
      return result;
    } catch (err) {
      console.error('Error adjusting partner brand community beans balance with system pool:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingSystemFortuneSettings(false);
    }
  };

  const adjustSystemFortuneBalance = async (delta, options = {}) => {
    try {
      setSavingSystemFortuneSettings(true);
      setSettingsError(null);

      const result = await DatabaseService.adjustSystemFortuneBalance(delta, options);
      setSystemFortuneSettings((current) => ({
        ...current,
        systemBeansBalance: result.systemBeansBalance
      }));
      await loadOverviewData();
      return result;
    } catch (err) {
      console.error('Error adjusting system fortune balance:', err);
      setSettingsError(getSetupErrorMessage(err));
      throw err;
    } finally {
      setSavingSystemFortuneSettings(false);
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
      await loadAdminSection('shop', { force: true });
    } catch (err) {
      console.error('Error saving shop product:', err);
      setError(getSetupErrorMessage(err));
      throw err;
    }
  };

  const updateShopOrderStatus = async (orderId, nextStatus) => {
    try {
      await DatabaseService.updateShopOrderStatus(orderId, nextStatus);
      await loadAdminSection('shop', { force: true });
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
    pointLedgerEntries,
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
    platformServiceFeeSettings,
    shopRewardSettings,
    systemFortuneSettings,
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
    partnerUsers,
    partnerBrands,
    partnerBrandMembers,
    partnerBrandInvites,
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
    savingPlatformServiceFeeSettings,
    savingShopRewardSettings,
    savingSystemFortuneSettings,
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
    updateShopRewardSettings,
    updateBrandCarouselSettings,
    updateUserAvatarOptionsSettings,
    updateClientDistributionSettings,
    updatePageMastheadSettings,
    updateShopHomeLivingSettings,
    updatePlatformServiceFeeSettings,
    updateSystemFortuneSettings,
    updateShopPartnerPricingSettings,
    updatePartnerBrandCommunityBeansBalance,
    adjustUserBalanceWithSystemPool,
    adjustPartnerBrandCommunityBeansBalance,
    adjustSystemFortuneBalance,
    updateStudentMembershipSettings,
    updatePartnerSubOrderStatus,
    saveShopProduct,
    updateShopOrderStatus,
    updateMeditationAudioLibrary,
    updateMeditationCompositionSettings,
    updateMeditationCalendar,
    updateMeditationLibrary,
    loadAdminSection,
    initializeDatabase,

    // Utility
    refresh: loadData
  };
};
