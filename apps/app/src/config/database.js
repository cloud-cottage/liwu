const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

const readEnv = (...names) => {
  const processEnv = typeof globalThis !== 'undefined' ? globalThis.process?.env : undefined;

  for (const name of names) {
    const viteValue = viteEnv?.[name];
    if (typeof viteValue === 'string' && viteValue.trim()) {
      return viteValue.trim();
    }

    const processValue = processEnv?.[name];
    if (typeof processValue === 'string' && processValue.trim()) {
      return processValue.trim();
    }
  }

  return undefined;
};

const isDevelopment = viteEnv?.DEV ?? readEnv('NODE_ENV') === 'development';

// Database configuration
export const DATABASE_CONFIG = {
  // CloudBase configuration
  cloudbase: {
    env: readEnv('VITE_CLOUDBASE_ENV', 'REACT_APP_CLOUDBASE_ENV') || 'liwu-0gtd91eebd863ccf',
    region: readEnv('VITE_CLOUDBASE_REGION', 'REACT_APP_CLOUDBASE_REGION') || 'ap-shanghai',
    publishableKey: readEnv('VITE_CLOUDBASE_PUBLISHABLE_KEY', 'REACT_APP_CLOUDBASE_PUBLISHABLE_KEY'),
    wechatProviderId: readEnv('VITE_CLOUDBASE_WECHAT_PROVIDER_ID', 'REACT_APP_CLOUDBASE_WECHAT_PROVIDER_ID') || 'wx_open'
  },
  
  // Collection names
  collections: {
    users: 'users',
    tagCategories: 'tag_categories',
    tags: 'tags',
    userTags: 'user_tags',
    appSettings: 'app_settings',
    awarenessRecords: 'awareness_records',
    shopCategories: 'shop_categories',
    shopProducts: 'shop_products',
    shopProductSkus: 'shop_product_skus',
    shopOrders: 'shop_orders',
    shopOrderItems: 'shop_order_items',
    partnerOrders: 'partner_orders',
    partnerSubOrders: 'partner_sub_orders',
    partnerBrands: 'partner_brands',
    partnerBrandMembers: 'partner_brand_members',
    partnerBrandInvites: 'partner_brand_invites',
    userAddresses: 'user_addresses',
    pointLedger: 'point_ledger',
    badgeProfiles: 'badge_profiles'
  },
  
  // Database options
  options: {
    timeout: 10000, // 10 seconds timeout
    retryCount: 3
  }
};

// Development fallback configuration
export const DEV_CONFIG = {
  useLocalStorage: isDevelopment && !DATABASE_CONFIG.cloudbase.publishableKey,
  mockData: true
};

export default DATABASE_CONFIG;
