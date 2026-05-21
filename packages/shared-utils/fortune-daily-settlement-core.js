import { resolveProductTypeByCategoryName } from './brand-scope-mapping.js';

export const DAILY_BEANS_BASE_AMOUNT = 100;
export const CONFIRMED_STATUSES = new Set(['shipped', 'completed', '已发货', '已完成']);
export const COURSE_BRAND_SCOPE_TAG_NAME = '理悟课程';

export const getShanghaiDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '';
  const month = parts.find((part) => part.type === 'month')?.value || '';
  const day = parts.find((part) => part.type === 'day')?.value || '';
  return year && month && day ? `${year}-${month}-${day}` : '';
};

export const getShanghaiDate = (dateKey) => {
  const normalized = String(dateKey || '').trim();
  if (!normalized) {
    return new Date(NaN);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date(`${normalized}T00:00:00+08:00`);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const [month, day, year] = normalized.split('/');
    return new Date(`${year}-${month}-${day}T00:00:00+08:00`);
  }

  return new Date(NaN);
};

export const getDaysDiffByShanghaiDateKey = (fromDateKey = '', toDateKey = getShanghaiDateKey()) => {
  if (!fromDateKey || !toDateKey) {
    return 0;
  }

  const fromDate = getShanghaiDate(fromDateKey);
  const toDate = getShanghaiDate(toDateKey);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)));
};

export const calculateDailyBeansConsumption = (
  shopYesterdaySales = 0,
  platformYesterdayTotalSales = 0,
  last7DaysOrderCount = 0,
  last30DaysOrderCount = 0
) => {
  let platformCoefficient = 0.8;
  if (platformYesterdayTotalSales >= 300000) {
    platformCoefficient = 2.0;
  } else if (platformYesterdayTotalSales >= 150000) {
    platformCoefficient = 1.5;
  } else if (platformYesterdayTotalSales >= 50000) {
    platformCoefficient = 1.2;
  } else if (platformYesterdayTotalSales >= 10000) {
    platformCoefficient = 1.0;
  }

  let shopCoefficient = 0.5;
  if (shopYesterdaySales >= 10000) {
    shopCoefficient = 1.3;
  } else if (shopYesterdaySales >= 2000) {
    shopCoefficient = 1.0;
  } else if (shopYesterdaySales >= 500) {
    shopCoefficient = 0.8;
  }

  let activityCoefficient = 0.3;
  if (last7DaysOrderCount > 0) {
    activityCoefficient = 1.0;
  } else if (last30DaysOrderCount > 0) {
    activityCoefficient = 0.7;
  }

  return Number((DAILY_BEANS_BASE_AMOUNT * platformCoefficient * shopCoefficient * activityCoefficient).toFixed(2));
};

export const calculateSpecialBrandDailyBeansConsumption = ({
  shopYesterdaySales = 0,
  platformYesterdayTotalSales = 0,
  last7DaysOrderCount = 0,
  last30DaysOrderCount = 0,
  nonPhysicalYesterdaySales = 0,
  platformYesterdayNonPhysicalTotalSales = 0
} = {}) => {
  const baseConsumption = calculateDailyBeansConsumption(
    shopYesterdaySales,
    platformYesterdayTotalSales,
    last7DaysOrderCount,
    last30DaysOrderCount
  );

  const nonPhysicalConsumption = calculateDailyBeansConsumption(
    nonPhysicalYesterdaySales,
    platformYesterdayNonPhysicalTotalSales,
    last7DaysOrderCount,
    last30DaysOrderCount
  );

  return Number((baseConsumption + nonPhysicalConsumption).toFixed(2));
};

export const resolveDailyBeansConsumption = ({
  roleType = 'brand_standard',
  shopYesterdaySales = 0,
  platformYesterdayTotalSales = 0,
  last7DaysOrderCount = 0,
  last30DaysOrderCount = 0,
  nonPhysicalYesterdaySales = 0,
  platformYesterdayNonPhysicalTotalSales = 0
} = {}) => {
  if (roleType === 'brand_course') {
    return calculateSpecialBrandDailyBeansConsumption({
      shopYesterdaySales,
      platformYesterdayTotalSales,
      last7DaysOrderCount,
      last30DaysOrderCount,
      nonPhysicalYesterdaySales,
      platformYesterdayNonPhysicalTotalSales
    });
  }

  return calculateDailyBeansConsumption(
    shopYesterdaySales,
    platformYesterdayTotalSales,
    last7DaysOrderCount,
    last30DaysOrderCount
  );
};

export const isPhysicalProduct = (categoryName = '', productType = '') => {
  if (productType) {
    return productType === 'physical';
  }
  return resolveProductTypeByCategoryName(categoryName) === 'physical';
};

export const createWealthHistoryEntry = ({ amount, description, source, relatedUserId = '' }) => ({
  id: `settlement_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  amount,
  description,
  date: new Date().toISOString(),
  type: amount >= 0 ? 'EARN' : 'SPEND',
  source,
  relatedUserId
});

export const runFortuneDailySettlement = async ({
  collections,
  queryAll,
  updateBrand,
  updateUser,
  updateSystemFortune,
  addPointLedger,
  log = () => {}
}) => {
  const [
    users,
    tags,
    userTags,
    products,
    shopOrders,
    shopOrderItems,
    partnerOrders,
    partnerSubOrders,
    partnerBrands,
    categories
  ] = await Promise.all([
    queryAll(collections.users),
    queryAll(collections.tags),
    queryAll(collections.userTags, 5000),
    queryAll(collections.shopProducts),
    queryAll(collections.shopOrders),
    queryAll(collections.shopOrderItems, 5000),
    queryAll(collections.partnerOrders),
    queryAll(collections.partnerSubOrders, 5000),
    queryAll(collections.partnerBrands),
    queryAll(collections.shopCategories)
  ]);

  log('data_loaded', {
    users: users.length,
    products: products.length,
    partnerOrders: partnerOrders.length,
    partnerSubOrders: partnerSubOrders.length,
    partnerBrands: partnerBrands.length
  });

  const getDocumentId = (document = {}) => document?._id || document?.id || '';
  const todayDateKey = getShanghaiDateKey();
  const todayStart = getShanghaiDate(todayDateKey);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const last7DaysStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30DaysStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);
  const categoryNameById = new Map(categories.map((category) => [getDocumentId(category), category.name || '']));
  const productById = new Map(products.map((product) => [getDocumentId(product), product]));
  const tagNameById = new Map(tags.map((tag) => [getDocumentId(tag), String(tag.name || '').trim()]));
  const userTagsByUserId = new Map();

  userTags.forEach((link) => {
    const userId = link.user_id || link.userId || '';
    if (!userId) {
      return;
    }
    if (!userTagsByUserId.has(userId)) {
      userTagsByUserId.set(userId, []);
    }
    userTagsByUserId.get(userId).push(tagNameById.get(link.tag_id || link.tagId || '') || '');
  });

  const platformPartnerEntries = partnerSubOrders
    .filter((subOrder) => isPhysicalProduct(subOrder.category || '', subOrder.product_type || subOrder.productType || ''))
    .map((subOrder) => ({
      key: `partner_${getDocumentId(subOrder)}`,
      amount: Number(subOrder.payable_amount ?? subOrder.payableAmount ?? 0),
      date: new Date(subOrder.created_at || subOrder.createdAt || subOrder.updated_at || subOrder.updatedAt || 0),
      brandId: String(subOrder.brand_id || subOrder.brandId || '').trim()
    }))
    .filter((entry) => !Number.isNaN(entry.date.getTime()));

  const platformPartnerNonPhysicalEntries = partnerSubOrders
    .filter((subOrder) => !isPhysicalProduct(subOrder.category || '', subOrder.product_type || subOrder.productType || ''))
    .map((subOrder) => ({
      key: `partner_non_physical_${getDocumentId(subOrder)}`,
      amount: Number(subOrder.payable_amount ?? subOrder.payableAmount ?? 0),
      date: new Date(subOrder.created_at || subOrder.createdAt || subOrder.updated_at || subOrder.updatedAt || 0),
      brandId: String(subOrder.brand_id || subOrder.brandId || '').trim()
    }))
    .filter((entry) => !Number.isNaN(entry.date.getTime()));

  const orderById = new Map(shopOrders.map((order) => [getDocumentId(order), order]));
  const platformShopEntries = shopOrderItems.reduce((sum, item) => {
    const product = productById.get(item.product_id || item.productId || '');
    const order = orderById.get(item.order_id || item.orderId || '');
    if (!product || !order) {
      return sum;
    }

    const categoryName = categoryNameById.get(product.category_id || product.categoryId || '') || '';
    if (!isPhysicalProduct(categoryName, product.product_type || product.productType || '')) {
      return sum;
    }

    const orderDate = new Date(order.created_at || order.createdAt || 0);
    if (Number.isNaN(orderDate.getTime())) {
      return sum;
    }

    return sum.concat({
      key: `shop_${getDocumentId(order)}`,
      amount: Number(item.subtotal_cash ?? item.subtotalCash ?? 0) + (Number(item.subtotal_points ?? item.subtotalPoints ?? 0) / 100),
      date: orderDate,
      brandId: String(product.brand_id || product.brandId || '').trim(),
      storeId: String(product.store_id || product.storeId || '').trim(),
      storeOwnerUserId: String(product.store_owner_user_id || product.storeOwnerUserId || '').trim()
    });
  }, []);

  const platformShopNonPhysicalEntries = shopOrderItems.reduce((sum, item) => {
    const product = productById.get(item.product_id || item.productId || '');
    const order = orderById.get(item.order_id || item.orderId || '');
    if (!product || !order) {
      return sum;
    }

    const categoryName = categoryNameById.get(product.category_id || product.categoryId || '') || '';
    if (isPhysicalProduct(categoryName, product.product_type || product.productType || '')) {
      return sum;
    }

    const orderDate = new Date(order.created_at || order.createdAt || 0);
    if (Number.isNaN(orderDate.getTime())) {
      return sum;
    }

    return sum.concat({
      key: `shop_non_physical_${getDocumentId(order)}_${item.product_id || item.productId || ''}`,
      amount: Number(item.subtotal_cash ?? item.subtotalCash ?? 0) + (Number(item.subtotal_points ?? item.subtotalPoints ?? 0) / 100),
      date: orderDate,
      brandId: String(product.brand_id || product.brandId || '').trim(),
      storeId: String(product.store_id || product.storeId || '').trim(),
      storeOwnerUserId: String(product.store_owner_user_id || product.storeOwnerUserId || '').trim()
    });
  }, []);

  const platformYesterdayTotalSales = Number([...platformPartnerEntries, ...platformShopEntries]
    .filter((entry) => entry.date >= yesterdayStart && entry.date < todayStart)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    .toFixed(2));

  const platformYesterdayNonPhysicalTotalSales = Number([...platformPartnerNonPhysicalEntries, ...platformShopNonPhysicalEntries]
    .filter((entry) => entry.date >= yesterdayStart && entry.date < todayStart)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    .toFixed(2));

  const brandResults = [];

  for (const brand of partnerBrands) {
    const brandId = getDocumentId(brand);
    if (!brandId) {
      continue;
    }

    const storeId = String(brand.slug || '').trim();
    const ownerUserId = String(brand.owner_user_id || brand.ownerUserId || '').trim();
    const brandScopeTags = Array.isArray(brand.brand_scope_tags || brand.brandScopeTags) ? (brand.brand_scope_tags || brand.brandScopeTags) : [];
    const roleType = brandScopeTags.includes(COURSE_BRAND_SCOPE_TAG_NAME) ? 'brand_course' : 'brand_standard';
    const scopedEntries = [
      ...platformPartnerEntries.filter((entry) => entry.brandId === brandId),
      ...platformShopEntries.filter((entry) => (
        entry.brandId === brandId
        || (storeId && entry.storeId === storeId)
        || (ownerUserId && entry.storeOwnerUserId === ownerUserId)
      ))
    ];
    const scopedNonPhysicalEntries = [
      ...platformPartnerNonPhysicalEntries.filter((entry) => entry.brandId === brandId),
      ...platformShopNonPhysicalEntries.filter((entry) => (
        entry.brandId === brandId
        || (storeId && entry.storeId === storeId)
        || (ownerUserId && entry.storeOwnerUserId === ownerUserId)
      ))
    ];

    const shopYesterdaySales = Number(scopedEntries
      .filter((entry) => entry.date >= yesterdayStart && entry.date < todayStart)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
      .toFixed(2));
    const last7DaysOrderCount = new Set(scopedEntries.filter((entry) => entry.date >= last7DaysStart).map((entry) => entry.key)).size;
    const last30DaysOrderCount = new Set(scopedEntries.filter((entry) => entry.date >= last30DaysStart).map((entry) => entry.key)).size;
    const nonPhysicalYesterdaySales = Number(scopedNonPhysicalEntries
      .filter((entry) => entry.date >= yesterdayStart && entry.date < todayStart)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
      .toFixed(2));
    const dailyConsumption = resolveDailyBeansConsumption({
      roleType,
      shopYesterdaySales,
      platformYesterdayTotalSales,
      last7DaysOrderCount,
      last30DaysOrderCount,
      nonPhysicalYesterdaySales: roleType === 'brand_course' ? nonPhysicalYesterdaySales : 0,
      platformYesterdayNonPhysicalTotalSales: roleType === 'brand_course' ? platformYesterdayNonPhysicalTotalSales : 0
    });
    const settledAt = brand.heart_lamp_daily_settled_at || brand.heartLampDailySettledAt || '';
    const daysToSettle = settledAt
      ? getDaysDiffByShanghaiDateKey(settledAt, todayDateKey)
      : 1;
    if (daysToSettle <= 0) {
      continue;
    }

    const currentBalance = Math.max(0, Number(brand.community_beans_balance ?? brand.communityBeansBalance ?? 0));
    const burnAmount = Math.min(currentBalance, Number((dailyConsumption * daysToSettle).toFixed(2)));
    const nextBalance = Math.max(0, Number((currentBalance - burnAmount).toFixed(2)));
    const nowIso = new Date().toISOString();

    await updateBrand(brandId, {
      community_beans_balance: nextBalance,
      heart_lamp_daily_settled_at: todayDateKey,
      heart_lamp_status: nextBalance <= 0 ? 'extinguished' : 'active',
      ...(nextBalance <= 0 && currentBalance > 0 ? { heart_lamp_last_extinguished_at: nowIso } : {}),
      updated_at: new Date()
    });

    if (burnAmount > 0) {
      await updateSystemFortune?.(burnAmount);
      await addPointLedger({
        user_id: '',
        delta: -burnAmount,
        balance_after: nextBalance,
        biz_type: 'brand_daily_burn',
        biz_id: brandId,
        description: `品牌方每日燃烧扣减 ${daysToSettle} 天`,
        operator_id: 'system_cron',
        created_at: nowIso
      });
    }

    brandResults.push({ brandId, burnAmount, nextBalance, daysToSettle });
  }

  const confirmedPartnerOrders = partnerOrders.filter((order) => {
    const orderId = getDocumentId(order);
    const subOrders = partnerSubOrders.filter((subOrder) => String(subOrder.partner_order_id || subOrder.partnerOrderId || '').trim() === orderId);
    return subOrders.length > 0 && subOrders.every((subOrder) => CONFIRMED_STATUSES.has(String(subOrder.status || '').trim()));
  });

  const agentResults = [];

  for (const user of users) {
    const userId = getDocumentId(user);
    if (!userId) {
      continue;
    }

    const tagNames = userTagsByUserId.get(userId) || [];
    if (!tagNames.includes('代理商')) {
      continue;
    }

    const scopedOrders = confirmedPartnerOrders.filter((order) => String(order.user_id || order.userId || '').trim() === userId);
    const shopYesterdaySales = Number(scopedOrders
      .filter((order) => {
        const submittedAt = new Date(order.submitted_at || order.submittedAt || order.created_at || order.createdAt || 0);
        return !Number.isNaN(submittedAt.getTime()) && submittedAt >= yesterdayStart && submittedAt < todayStart;
      })
      .reduce((sum, order) => sum + Number(order.list_amount ?? order.listAmount ?? 0), 0)
      .toFixed(2));
    const last7DaysOrderCount = scopedOrders.filter((order) => {
      const submittedAt = new Date(order.submitted_at || order.submittedAt || order.created_at || order.createdAt || 0);
      return !Number.isNaN(submittedAt.getTime()) && submittedAt >= last7DaysStart;
    }).length;
    const last30DaysOrderCount = scopedOrders.filter((order) => {
      const submittedAt = new Date(order.submitted_at || order.submittedAt || order.created_at || order.createdAt || 0);
      return !Number.isNaN(submittedAt.getTime()) && submittedAt >= last30DaysStart;
    }).length;
    const dailyConsumption = resolveDailyBeansConsumption({
      roleType: 'agent',
      shopYesterdaySales,
      platformYesterdayTotalSales,
      last7DaysOrderCount,
      last30DaysOrderCount
    });
    const settledAt = user.beans_daily_settled_at || user.beansDailySettledAt || '';
    const daysToSettle = settledAt
      ? getDaysDiffByShanghaiDateKey(settledAt, todayDateKey)
      : 1;
    if (daysToSettle <= 0) {
      continue;
    }

    const currentBalance = Math.max(0, Number(user.balance || 0));
    const burnAmount = Math.min(currentBalance, Number((dailyConsumption * daysToSettle).toFixed(2)));
    const nextBalance = Math.max(0, Number((currentBalance - burnAmount).toFixed(2)));
    const nowIso = new Date().toISOString();
    const wealthHistoryEntry = burnAmount > 0
      ? createWealthHistoryEntry({
          amount: -burnAmount,
          description: `代理商每日燃烧扣减 ${daysToSettle} 天`,
          source: 'agent_daily_burn',
          relatedUserId: userId
        })
      : null;

    await updateUser(userId, {
      balance: nextBalance,
      beans_daily_settled_at: todayDateKey,
      ...(nextBalance <= 0 && currentBalance > 0 ? { beans_last_extinguished_at: nowIso } : {}),
      wealth_history: wealthHistoryEntry ? [wealthHistoryEntry].concat(user.wealth_history || []) : (user.wealth_history || []),
      updated_at: nowIso
    });

    if (burnAmount > 0) {
      await updateSystemFortune?.(burnAmount);
      await addPointLedger({
        user_id: userId,
        delta: -burnAmount,
        balance_after: nextBalance,
        biz_type: 'agent_daily_burn',
        biz_id: userId,
        description: `代理商每日燃烧扣减 ${daysToSettle} 天`,
        operator_id: 'system_cron',
        created_at: nowIso
      });
    }

    agentResults.push({ userId, burnAmount, nextBalance, daysToSettle });
  }

  return {
    ok: true,
    date: todayDateKey,
    brandSettlements: brandResults.length,
    agentSettlements: agentResults.length,
    platformYesterdayTotalSales
  };
};
