import React, { useEffect, useMemo, useState } from 'react';
import { uploadImageAsWebp } from '../../utils/imageUpload.js';
import { BRAND_SCOPE_DEFINITIONS as BRAND_SCOPE_OPTIONS, resolveProductTypeByCategoryName } from '@liwu/shared-utils/brand-scope-mapping.js';

const formatCash = (value) => (value ? `¥${Number(value).toFixed(2)}` : '纯福豆');
const BRAND_LEAD_ROLE_TAG_NAME = '品牌方主理人';
const BRAND_MEMBER_ROLE_TAG_NAME = '品牌方';

const SHOWCASE_ASPECT_PRESETS = [
  { key: '1:1', width: 1, height: 1 },
  { key: '1:2', width: 1, height: 2 },
  { key: '1:3', width: 1, height: 3 },
  { key: '1:4', width: 1, height: 4 },
  { key: '2:3', width: 2, height: 3 },
  { key: '3:4', width: 3, height: 4 },
  { key: '2:1', width: 2, height: 1 },
  { key: '3:1', width: 3, height: 1 },
  { key: '4:1', width: 4, height: 1 },
  { key: '3:2', width: 3, height: 2 },
  { key: '4:3', width: 4, height: 3 }
];

const resolveClosestShowcaseAspectRatio = (width = 0, height = 0) => {
  const normalizedWidth = Math.max(0, Number(width) || 0);
  const normalizedHeight = Math.max(0, Number(height) || 0);

  if (!normalizedWidth || !normalizedHeight) {
    return '1:1';
  }

  const targetRatio = normalizedWidth / normalizedHeight;

  return SHOWCASE_ASPECT_PRESETS.reduce((closestKey, preset) => {
    const presetRatio = preset.width / preset.height;
    const closestPreset = SHOWCASE_ASPECT_PRESETS.find((item) => item.key === closestKey) || SHOWCASE_ASPECT_PRESETS[0];
    const closestDelta = Math.abs((closestPreset.width / closestPreset.height) - targetRatio);
    const presetDelta = Math.abs(presetRatio - targetRatio);

    return presetDelta < closestDelta ? preset.key : closestKey;
  }, '1:1');
};

const loadImageDimensions = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({
    width: image.naturalWidth || image.width || 0,
    height: image.naturalHeight || image.height || 0
  });
  image.onerror = () => reject(new Error('图片尺寸识别失败'));
  image.src = src;
});

const resolveShowcaseAspectRatioFromFile = async (file) => {
  if (!file) {
    return '1:1';
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const dimensions = await loadImageDimensions(objectUrl);
    return resolveClosestShowcaseAspectRatio(dimensions.width, dimensions.height);
  } catch {
    return '1:1';
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const resolveShowcaseAspectRatioFromUrl = async (url = '') => {
  if (!url) {
    return '1:1';
  }

  try {
    const dimensions = await loadImageDimensions(url);
    return resolveClosestShowcaseAspectRatio(dimensions.width, dimensions.height);
  } catch {
    return '1:1';
  }
};

const statusLabelMap = {
  draft: '草稿',
  active: '上架中',
  archived: '已归档',
  sold_out: '已售罄',
  paid: '已支付',
  pending_payment: '待支付',
  processing: '处理中',
  shipped: '已发货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款'
};

const productStatusToneMap = {
  draft: {
    backgroundColor: '#eef2ff',
    color: '#4338ca',
    borderColor: 'rgba(67, 56, 202, 0.14)'
  },
  active: {
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderColor: 'rgba(22, 101, 52, 0.14)'
  },
  archived: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
    borderColor: 'rgba(51, 65, 85, 0.14)'
  },
  sold_out: {
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderColor: 'rgba(185, 28, 28, 0.14)'
  }
};

const brandTone = {
  panelBorder: 'rgba(148, 163, 184, 0.22)',
  heroBackground: 'linear-gradient(135deg, #fffaf1 0%, #fff 46%, #f6f9fc 100%)',
  heroShadow: '0 24px 64px rgba(15, 23, 42, 0.08)',
  accent: '#9a3412',
  accentSoft: 'rgba(154, 52, 18, 0.08)',
  accentStrong: '#7c2d12',
  ink: '#0f172a',
  muted: '#64748b',
  surface: '#ffffff',
  subSurface: '#f8fafc',
  subSurfaceStrong: '#f3f6fb'
};

const createEmptySku = () => ({
  id: '',
  skuName: '',
  skuCode: '',
  stock: 0,
  status: 'active'
});

const createEmptyGalleryItem = () => ({
  id: `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  url: '',
  showcaseEnabled: false,
  showcaseAspectRatio: ''
});

const createEmptyLivingCard = (index) => ({
  id: `shop_living_${index + 1}`,
  fileId: '',
  imageUrl: '',
  productId: ''
});

const normalizeLivingCards = (settings = {}) => (
  Array.from({ length: 6 }, (_, index) => ({
    ...createEmptyLivingCard(index),
    ...(settings.cards?.[index] || {})
  }))
);

const normalizeGalleryItems = (product = null) => {
  const showcaseByUrl = new Map(
    (product?.showcaseMedia || [])
      .filter((item) => item?.url)
      .map((item) => [item.url, item])
  );

  return (product?.gallery || []).map((item, index) => {
    const url = typeof item === 'string' ? item : (item?.url || '');
    const showcaseEntry = showcaseByUrl.get(url);

    return {
      id: typeof item === 'string' ? `gallery_${index}` : (item?.id || `gallery_${index}`),
      url,
      showcaseEnabled: Boolean(showcaseEntry),
      showcaseAspectRatio: showcaseEntry?.aspectRatio || showcaseEntry?.ratio || ''
    };
  });
};

export const createProductDraft = (product = null, skus = []) => ({
  id: product?.id || '',
  name: product?.name || '',
  subtitle: product?.subtitle || '',
  categoryId: product?.categoryId || '',
  relatedProductId: product?.relatedProductId || '',
  coverImage: product?.coverImage || '',
  description: product?.description || '',
  status: product?.status || 'draft',
  skuMode: product?.skuMode || 'single',
  priceCash: product?.priceCash || product?.priceCashFrom || 0,
  beansDeductionRatio: product?.beansDeductionRatio ?? 0.1,
  pricePointsFrom: product?.pricePointsFrom || 0,
  priceCashFrom: product?.priceCashFrom || 0,
  rewardPointsReturnFrom: product?.rewardPointsReturnFrom || 0,
  stockTotal: product?.stockTotal || 0,
  salesCount: product?.salesCount || 0,
  limitPerUser: product?.limitPerUser || 0,
  sortOrder: product?.sortOrder || 0,
  brandScopes: Array.isArray(product?.tags) ? product.tags.filter((tag) => BRAND_SCOPE_OPTIONS.some((option) => option.tagName === tag)) : [],
  gallery: normalizeGalleryItems(product),
  skus: skus.length > 0 ? skus.map((sku) => ({ ...sku })) : [createEmptySku()]
});

const ShopManagement = ({
  categories,
  products,
  skus,
  orders,
  orderItems,
  users = [],
  partnerOrders,
  partnerSubOrders,
  partnerUsers,
  partnerBrands,
  partnerBrandMembers,
  partnerBrandInvites,
  shopHomeLivingSettings,
  savingShopHomeLivingSettings,
  onSaveProduct,
  onSaveShopHomeLivingSettings,
  onUpdateOrderStatus,
  onUpdatePartnerSubOrderStatus,
  onUpdatePartnerBrandCommunityBeansBalance,
  actorUser = null,
  actorUserTags = null,
  mode = 'admin',
  showCreateButton = true
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);
  const [productDraft, setProductDraft] = useState(() => createProductDraft());
  const [savingProduct, setSavingProduct] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGalleryIndex, setUploadingGalleryIndex] = useState(-1);
  const [uploadingGalleryBatch, setUploadingGalleryBatch] = useState(false);
  const [livingCardsDraft, setLivingCardsDraft] = useState(() => normalizeLivingCards(shopHomeLivingSettings));
  const [uploadingLivingCardIndex, setUploadingLivingCardIndex] = useState(-1);
  const [selectedPartnerStatus, setSelectedPartnerStatus] = useState('all');
  const [updatingPartnerSubOrderId, setUpdatingPartnerSubOrderId] = useState('');
  const [adminSection, setAdminSection] = useState('overview');
  const [adjustingBrandId, setAdjustingBrandId] = useState('');
  const [editingOrder, setEditingOrder] = useState(null);
  const [orderError, setOrderError] = useState('');

  useEffect(() => {
    setLivingCardsDraft(normalizeLivingCards(shopHomeLivingSettings));
  }, [shopHomeLivingSettings]);

  const effectiveUser = actorUser || {};
  const effectiveUserTags = Array.isArray(actorUserTags) && actorUserTags.length > 0 ? actorUserTags : [];

  const currentRoleTagNames = useMemo(
    () => effectiveUserTags.map((tag) => String(tag?.name || tag?.label || tag || '').trim()),
    [effectiveUserTags]
  );

  const isPrivilegedManager = useMemo(() => {
    if (mode !== 'brand') {
      return true;
    }

    return (
      currentRoleTagNames.includes('超级管理员') ||
      currentRoleTagNames.includes('管理员')
    );
  }, [currentRoleTagNames, mode]);

  const currentBrandScopeTags = useMemo(
    () => currentRoleTagNames.filter((tagName) => BRAND_SCOPE_OPTIONS.some((option) => option.tagName === tagName)),
    [currentRoleTagNames]
  );
  const currentStoreId = String(effectiveUser?.storeId || '').trim();
  const isBrandLeadUser = currentRoleTagNames.includes(BRAND_LEAD_ROLE_TAG_NAME);
  const isBrandMemberUser = currentRoleTagNames.includes(BRAND_MEMBER_ROLE_TAG_NAME);

  const brandScopedCategories = useMemo(() => {
    if (isPrivilegedManager || currentBrandScopeTags.length === 0) {
      return categories;
    }

    const allowedCategoryNames = new Set(
      BRAND_SCOPE_OPTIONS
        .filter((option) => currentBrandScopeTags.includes(option.tagName))
        .map((option) => option.categoryName)
    );

    return categories.filter((category) => allowedCategoryNames.has(category.name));
  }, [categories, currentBrandScopeTags, isPrivilegedManager]);

  const allowedCategoryIds = useMemo(
    () => new Set(brandScopedCategories.map((category) => category.id)),
    [brandScopedCategories]
  );
  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name || ''])),
    [categories]
  );

  useEffect(() => {
    if (!selectedCategoryId || allowedCategoryIds.has(selectedCategoryId)) {
      return;
    }

    setSelectedCategoryId('');
  }, [allowedCategoryIds, selectedCategoryId]);

  const filteredProducts = useMemo(() => (
    (selectedCategoryId
      ? products.filter((product) => product.categoryId === selectedCategoryId)
      : products)
      .filter((product) => {
        if (isPrivilegedManager) {
          return true;
        }

        const categoryAllowed = allowedCategoryIds.size === 0 || allowedCategoryIds.has(product.categoryId);
        const storeAllowed = mode === 'brand'
          ? true
          : (!currentStoreId || String(product.storeId || '').trim() === currentStoreId);
        return categoryAllowed && storeAllowed;
      })
  ), [allowedCategoryIds, currentStoreId, isPrivilegedManager, mode, products, selectedCategoryId]);

  const skusByProductId = useMemo(() => {
    const nextMap = new Map();

    skus.forEach((sku) => {
      if (!nextMap.has(sku.productId)) {
        nextMap.set(sku.productId, []);
      }
      nextMap.get(sku.productId).push(sku);
    });

    return nextMap;
  }, [skus]);

  const orderItemsByOrderId = useMemo(() => {
    const nextMap = new Map();

    orderItems.forEach((item) => {
      if (!nextMap.has(item.orderId)) {
        nextMap.set(item.orderId, []);
      }
      nextMap.get(item.orderId).push(item);
    });

    return nextMap;
  }, [orderItems]);

  const userUidById = useMemo(() => {
    const nextMap = new Map();
    users.forEach((user) => {
      if (user.id && user.uid) {
        nextMap.set(user.id, user.uid);
      }
    });
    return nextMap;
  }, [users]);

  const resolveUserUid = (userId) => {
    if (!userId) return '未知';
    const uid = userUidById.get(userId);
    return uid !== undefined ? String(uid) : userId;
  };

  const filteredPartnerOrders = useMemo(() => (
    selectedPartnerStatus === 'all'
      ? partnerOrders
      : selectedPartnerStatus === 'exception'
        ? partnerOrders.filter((order) => (
            partnerSubOrders.some((subOrder) => (
              subOrder.partnerOrderId === order.id &&
              !['shipped', 'completed', '已发货'].includes(subOrder.status || '')
            ))
          ))
        : partnerOrders.filter((order) => (
            partnerSubOrders.some((subOrder) => subOrder.partnerOrderId === order.id && subOrder.status === selectedPartnerStatus)
          ))
  ), [partnerOrders, partnerSubOrders, selectedPartnerStatus]);

  const productStatusSummary = useMemo(() => ({
    active: filteredProducts.filter((product) => product.status === 'active').length,
    draft: filteredProducts.filter((product) => product.status === 'draft').length,
    soldOut: filteredProducts.filter((product) => product.status === 'sold_out').length,
    showcase: filteredProducts.filter((product) => (product.showcaseMedia || []).length > 0).length,
    lowStock: filteredProducts.filter((product) => Number(product.stockTotal || 0) > 0 && Number(product.stockTotal || 0) <= 10).length
  }), [filteredProducts]);

  const totalVisibleSkus = useMemo(
    () => filteredProducts.reduce((total, product) => total + (skusByProductId.get(product.id) || []).length, 0),
    [filteredProducts, skusByProductId]
  );

  const partnerOrderSummary = useMemo(() => ({
    exception: partnerOrders.filter((order) => (
      partnerSubOrders.some((subOrder) => (
        subOrder.partnerOrderId === order.id &&
        !['shipped', 'completed', '已发货'].includes(subOrder.status || '')
      ))
    )).length,
    accepted: partnerSubOrders.filter((subOrder) => subOrder.status === 'accepted').length,
    packing: partnerSubOrders.filter((subOrder) => subOrder.status === 'packing').length,
    shipped: partnerSubOrders.filter((subOrder) => ['shipped', '已发货'].includes(subOrder.status || '')).length
  }), [partnerOrders, partnerSubOrders]);

  const partnerAgentUsers = useMemo(
    () => partnerUsers.filter((user) => (user.tags || []).some((tag) => String(tag?.name || '').trim() === '代理商')),
    [partnerUsers]
  );

  const brandMembersByBrandId = useMemo(() => {
    const nextMap = new Map();
    partnerBrandMembers.forEach((member) => {
      if (!nextMap.has(member.brandId)) {
        nextMap.set(member.brandId, []);
      }
      nextMap.get(member.brandId).push(member);
    });
    return nextMap;
  }, [partnerBrandMembers]);

  const brandOwnerNameByBrandId = useMemo(() => {
    const nextMap = new Map();
    partnerBrands.forEach((brand) => {
      const owner = partnerUsers.find((user) => user.id === brand.ownerUserId) || null;
      nextMap.set(brand.id, owner?.name || owner?.phone || '未绑定');
    });
    return nextMap;
  }, [partnerBrands, partnerUsers]);

  const handleEditProduct = (product) => {
    const productSkus = skusByProductId.get(product.id) || [];
    setEditingProduct(product);
    setProductDraft({
      ...createProductDraft(product, productSkus),
      brandScopes: isPrivilegedManager
        ? createProductDraft(product, productSkus).brandScopes
        : currentBrandScopeTags
    });
  };

  const handleCreateProduct = () => {
    setEditingProduct({});
    setProductDraft({
      ...createProductDraft(),
      brandScopes: isPrivilegedManager ? [] : currentBrandScopeTags
    });
  };

  const handleProductDraftChange = (field, value) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      [field]: ['priceCash', 'beansDeductionRatio', 'pricePointsFrom', 'priceCashFrom', 'rewardPointsReturnFrom', 'stockTotal', 'salesCount', 'limitPerUser', 'sortOrder'].includes(field)
        ? Number(value || 0)
        : value
    }));
  };

  const allowedCategoryOptions = useMemo(() => {
    if (!isPrivilegedManager) {
      return brandScopedCategories;
    }

    const draftBrandScopes = Array.isArray(productDraft.brandScopes) ? productDraft.brandScopes : [];
    if (draftBrandScopes.length === 0) {
      return categories;
    }

    const allowedCategoryNames = new Set(
      BRAND_SCOPE_OPTIONS
        .filter((option) => draftBrandScopes.includes(option.tagName))
        .map((option) => option.categoryName)
    );

    return categories.filter((category) => allowedCategoryNames.has(category.name));
  }, [brandScopedCategories, categories, isPrivilegedManager, productDraft.brandScopes]);

  const handleSkuChange = (index, field, value) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      skus: currentDraft.skus.map((sku, skuIndex) => (
        skuIndex === index
          ? {
              ...sku,
              [field]: ['stock'].includes(field) ? Number(value || 0) : value
            }
          : sku
      ))
    }));
  };

  const handleGalleryChange = (index, field, value) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      gallery: currentDraft.gallery.map((item, itemIndex) => (
        itemIndex === index
          ? {
              ...item,
              [field]: field === 'showcaseEnabled' ? Boolean(value) : value
            }
          : item
      ))
    }));
  };

  const handleUploadCoverImage = async (file) => {
    if (!file) {
      return;
    }

    setUploadingCover(true);
    try {
      const uploadResult = await uploadImageAsWebp({
        file,
        cloudPath: `liwu/shop-cover/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`
      });

      setProductDraft((currentDraft) => ({
        ...currentDraft,
        coverImage: uploadResult.imageUrl
      }));
    } finally {
      setUploadingCover(false);
    }
  };

  const handleUploadGalleryImage = async (index, file) => {
    if (!file) {
      return;
    }

    setUploadingGalleryIndex(index);
    try {
      const showcaseAspectRatio = await resolveShowcaseAspectRatioFromFile(file);
      const uploadResult = await uploadImageAsWebp({
        file,
        cloudPath: `liwu/shop-gallery/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`
      });

      setProductDraft((currentDraft) => ({
        ...currentDraft,
        gallery: currentDraft.gallery.map((item, itemIndex) => (
          itemIndex === index
            ? {
                ...item,
                url: uploadResult.imageUrl,
                showcaseAspectRatio
              }
            : item
        ))
      }));
    } finally {
      setUploadingGalleryIndex(-1);
    }
  };

  const handleUploadGalleryImages = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) {
      return;
    }

    setUploadingGalleryBatch(true);
    try {
      const uploadedItems = [];

      for (const file of files) {
        const showcaseAspectRatio = await resolveShowcaseAspectRatioFromFile(file);
        const uploadResult = await uploadImageAsWebp({
          file,
          cloudPath: `liwu/shop-gallery/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`
        });

        uploadedItems.push({
          ...createEmptyGalleryItem(),
          url: uploadResult.imageUrl,
          showcaseAspectRatio
        });
      }

      setProductDraft((currentDraft) => {
        const remainingItems = [...uploadedItems];
        const nextGallery = currentDraft.gallery.map((item) => {
          if (item.url || remainingItems.length === 0) {
            return item;
          }

          const nextUploadedItem = remainingItems.shift();
          return {
            ...item,
            url: nextUploadedItem.url
          };
        });

        return {
          ...currentDraft,
          gallery: [...nextGallery, ...remainingItems]
        };
      });
    } finally {
      setUploadingGalleryBatch(false);
    }
  };

  const handleAddSku = () => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      skus: [...currentDraft.skus, createEmptySku()]
    }));
  };

  const handleRemoveSku = (index) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      skus: currentDraft.skus.filter((_, skuIndex) => skuIndex !== index)
    }));
  };

  const handleAddGalleryItem = () => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      gallery: [...currentDraft.gallery, createEmptyGalleryItem()]
    }));
  };

  const handleRemoveGalleryItem = (index) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      gallery: currentDraft.gallery.filter((_, itemIndex) => itemIndex !== index)
    }));
  };

  const handleSaveProduct = async () => {
    setSavingProduct(true);
    try {
      if (!isPrivilegedManager && currentBrandScopeTags.length > 0 && !allowedCategoryIds.has(productDraft.categoryId)) {
        throw new Error('当前品牌方账号没有该商品分类的发布权限');
      }

      const galleryItems = productDraft.gallery.filter((item) => item.url);
      const showcaseMedia = await Promise.all(
        galleryItems
          .filter((item) => item.showcaseEnabled)
          .map(async (item) => ({
            id: item.id,
            url: item.url,
            aspectRatio: await resolveShowcaseAspectRatioFromUrl(item.url)
          }))
      );

      const nextDraft = {
        ...productDraft,
        tags: isPrivilegedManager ? (productDraft.brandScopes || []) : currentBrandScopeTags,
        gallery: galleryItems.map((item) => item.url),
        showcaseMedia
      };

      await onSaveProduct(nextDraft);
      setEditingProduct(null);
      setProductDraft(createProductDraft());
    } finally {
      setSavingProduct(false);
    }
  };

  const handleToggleProductStatus = async (product) => {
    if (!product?.id) {
      return;
    }

    setSavingProduct(true);
    try {
      const nextStatus = product.status === 'active' ? 'draft' : 'active';
      const productSkus = skusByProductId.get(product.id) || [];
      await onSaveProduct({
        ...createProductDraft(product, productSkus),
        status: nextStatus,
        brandScopes: isPrivilegedManager
          ? createProductDraft(product, productSkus).brandScopes
          : currentBrandScopeTags
      });
    } finally {
      setSavingProduct(false);
    }
  };

  const handleLivingCardChange = (index, patch) => {
    setLivingCardsDraft((currentCards) => currentCards.map((card, cardIndex) => (
      cardIndex === index
        ? {
            ...card,
            ...patch
          }
        : card
    )));
  };

  const handleUploadLivingCardImage = async (index, file) => {
    if (!file) {
      return;
    }

    setUploadingLivingCardIndex(index);
    try {
      const uploadResult = await uploadImageAsWebp({
        file,
        cloudPath: `liwu/shop-home-living/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.webp`
      });

      handleLivingCardChange(index, {
        fileId: uploadResult.fileId,
        imageUrl: uploadResult.imageUrl
      });
    } finally {
      setUploadingLivingCardIndex(-1);
    }
  };

  const handleSaveLivingSettings = async () => {
    try {
      await onSaveShopHomeLivingSettings({
        ...shopHomeLivingSettings,
        imageWidth: 700,
        imageHeight: 700,
        cards: livingCardsDraft
      });
    } catch (error) {
      console.error('保存我的居心地设置失败:', error);
    }
  };

  const handleOrderStatusUpdate = async (orderId, nextStatus) => {
    setUpdatingOrderId(orderId);
    setOrderError('');
    try {
      await onUpdateOrderStatus(orderId, nextStatus);
    } catch (err) {
      const message = err?.message || String(err);
      setOrderError(`操作失败：${message}`);
      console.error('Order status update failed:', err);
    } finally {
      setUpdatingOrderId('');
    }
  };

  const handlePartnerSubOrderStatusUpdate = async (subOrderId, nextStatus) => {
    setUpdatingPartnerSubOrderId(subOrderId);
    try {
      await onUpdatePartnerSubOrderStatus(subOrderId, nextStatus);
    } finally {
      setUpdatingPartnerSubOrderId('');
    }
  };

  const handleAdjustPartnerBrandCommunityBeansBalance = async (brand, delta) => {
    if (!brand?.id || !delta) {
      return;
    }

    setAdjustingBrandId(brand.id);
    try {
      await onUpdatePartnerBrandCommunityBeansBalance(
        brand.id,
        Math.max(0, Number(brand.communityBeansBalance || 0) + Number(delta || 0))
      );
    } finally {
      setAdjustingBrandId('');
    }
  };

  const renderProductManagementSection = () => (
    <div
      style={{
        backgroundColor: brandTone.surface,
        borderRadius: '24px',
        padding: mode === 'brand' ? '24px' : '28px',
        boxShadow: mode === 'brand' ? brandTone.heroShadow : '0 4px 18px rgba(0, 0, 0, 0.06)',
        border: mode === 'brand' ? `1px solid ${brandTone.panelBorder}` : 'none',
        overflow: 'hidden'
      }}
    >
      {mode === 'brand' && (
        <div
          style={{
            margin: '-24px -24px 24px',
            padding: '28px 24px 22px',
            background: brandTone.heroBackground,
            borderBottom: `1px solid ${brandTone.panelBorder}`,
            display: 'grid',
            gap: '20px'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'grid', gap: '10px', maxWidth: '760px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '999px', backgroundColor: brandTone.accentSoft, color: brandTone.accentStrong, fontSize: '12px', fontWeight: 800, width: 'fit-content', letterSpacing: '0.04em' }}>
                品牌方后台
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '28px', lineHeight: 1.15, color: brandTone.ink }}>商品管理</h3>
                <p style={{ margin: '10px 0 0', fontSize: '14px', lineHeight: 1.8, color: brandTone.muted }}>
                  在这里统一处理品牌商品上架、橱窗素材、SKU 库存与可发布类目。首屏优先展示当前可售规模和待处理风险，减少逐卡片翻找。
                </p>
              </div>
            </div>
            {showCreateButton && (
              <button
                type="button"
                onClick={handleCreateProduct}
                style={{
                  border: 'none',
                  borderRadius: '14px',
                  backgroundColor: brandTone.ink,
                  color: '#fff',
                  padding: '14px 18px',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 12px 24px rgba(15, 23, 42, 0.18)'
                }}
              >
                新建商品
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
            <BrandMetricCard label="当前商品" value={filteredProducts.length} hint="已进入当前筛选范围" tone="default" />
            <BrandMetricCard label="上架中" value={productStatusSummary.active} hint="正在对外售卖" tone="success" />
            <BrandMetricCard label="草稿待完善" value={productStatusSummary.draft} hint="未进入售卖" tone="warning" />
            <BrandMetricCard label="低库存" value={productStatusSummary.lowStock} hint="库存 10 件及以下" tone="danger" />
            <BrandMetricCard label="SKU 总数" value={totalVisibleSkus} hint="当前商品规格数" tone="default" />
            <BrandMetricCard label="有橱窗素材" value={productStatusSummary.showcase} hint="已配置首页展示图" tone="accent" />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: mode === 'brand' ? '18px' : '20px', color: '#111827' }}>商品清单</h3>
          <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
            {selectedCategoryId
              ? `当前仅显示「${categories.find((category) => category.id === selectedCategoryId)?.name || '当前分类'}」商品`
              : '当前显示全部可管理商品'}
          </div>
        </div>
        {mode !== 'brand' && showCreateButton && (
          <button
            type="button"
            onClick={handleCreateProduct}
            style={{
              border: 'none',
              borderRadius: '10px',
              backgroundColor: '#111827',
              color: '#fff',
              padding: '12px 18px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            新建商品
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <FilterButton active={!selectedCategoryId} onClick={() => setSelectedCategoryId('')}>
          全部
        </FilterButton>
        {categories.map((category) => (
          <FilterButton key={category.id} active={selectedCategoryId === category.id} onClick={() => setSelectedCategoryId(category.id)}>
            {category.name}
          </FilterButton>
        ))}
      </div>

      {filteredProducts.length === 0 ? (
        <div
          style={{
            borderRadius: '20px',
            border: `1px dashed ${brandTone.panelBorder}`,
            backgroundColor: brandTone.subSurface,
            padding: '28px',
            textAlign: 'center',
            color: brandTone.muted,
            fontSize: '14px',
            lineHeight: 1.8
          }}
        >
          当前筛选范围内还没有商品。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredProducts.map((product) => {
            const productSkus = skusByProductId.get(product.id) || [];
            const category = categories.find((item) => item.id === product.categoryId);
            const productType = resolveProductTypeByCategoryName(category?.name || '');
            const statusTone = productStatusToneMap[product.status] || productStatusToneMap.archived;
            const metricItems = [
              { label: '价格', value: `${formatCash(product.priceCash || 0)}` },
              { label: '福豆抵用上限', value: `${Math.round(Number(product.beansDeductionRatio || 0) * 100)}%` },
              { label: '库存 / 销量', value: `${product.stockTotal} / ${product.salesCount}` },
              { label: '限购', value: product.limitPerUser || '不限' }
            ];

            return (
              <div
                key={product.id}
                style={{
                  borderRadius: '22px',
                  border: `1px solid ${brandTone.panelBorder}`,
                  background: 'linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)',
                  padding: '20px',
                  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)'
                }}
              >
                <div style={{ display: 'grid', gap: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'grid', gap: '10px', minWidth: '260px', flex: '1 1 420px' }}>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '7px 11px',
                            borderRadius: '999px',
                            backgroundColor: statusTone.backgroundColor,
                            color: statusTone.color,
                            border: `1px solid ${statusTone.borderColor}`,
                            fontSize: '12px',
                            fontWeight: 700
                          }}
                        >
                          {statusLabelMap[product.status] || product.status}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '7px 11px',
                            borderRadius: '999px',
                            backgroundColor: brandTone.subSurfaceStrong,
                            color: brandTone.ink,
                            fontSize: '12px',
                            fontWeight: 700
                          }}
                        >
                          {category?.name || '未分类'}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '7px 11px',
                            borderRadius: '999px',
                            backgroundColor: '#fff7ed',
                            color: '#9a3412',
                            fontSize: '12px',
                            fontWeight: 700
                          }}
                        >
                          {productType === 'service' ? '线上交付' : '实物寄送'}
                        </span>
                        {(product.showcaseMedia || []).length > 0 && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '7px 11px',
                              borderRadius: '999px',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              fontSize: '12px',
                              fontWeight: 700
                            }}
                          >
                            橱窗图 {(product.showcaseMedia || []).length} 张
                          </span>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: '22px', lineHeight: 1.2, fontWeight: 800, color: brandTone.ink }}>{product.name}</div>
                        <div style={{ marginTop: '8px', fontSize: '14px', color: brandTone.muted, lineHeight: 1.8 }}>
                          {product.subtitle || product.description || '暂无商品描述'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        onClick={() => handleEditProduct(product)}
                        style={{
                          border: `1px solid ${brandTone.panelBorder}`,
                          borderRadius: '12px',
                          backgroundColor: '#fff',
                          color: brandTone.ink,
                          padding: '11px 14px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        编辑商品
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleToggleProductStatus(product); }}
                        disabled={savingProduct}
                        style={{
                          border: 'none',
                          borderRadius: '12px',
                          backgroundColor: product.status === 'active' ? '#fff7ed' : '#ecfccb',
                          color: product.status === 'active' ? '#9a3412' : '#3f6212',
                          padding: '11px 14px',
                          fontSize: '13px',
                          fontWeight: 700,
                          cursor: savingProduct ? 'default' : 'pointer',
                          opacity: savingProduct ? 0.7 : 1
                        }}
                      >
                        {product.status === 'active' ? '下架商品' : '立即上架'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                    {metricItems.map((item) => (
                      <div
                        key={item.label}
                        style={{
                          borderRadius: '16px',
                          backgroundColor: brandTone.subSurface,
                          border: `1px solid ${brandTone.panelBorder}`,
                          padding: '14px 16px'
                        }}
                      >
                        <div style={{ fontSize: '12px', color: brandTone.muted }}>{item.label}</div>
                        <div style={{ marginTop: '8px', fontSize: '15px', lineHeight: 1.4, color: brandTone.ink, fontWeight: 700 }}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: productSkus.length > 0 ? 'minmax(0, 1fr) minmax(280px, 360px)' : 'minmax(0, 1fr)',
                      gap: '16px'
                    }}
                  >
                    <div
                      style={{
                        borderRadius: '18px',
                        border: `1px solid ${brandTone.panelBorder}`,
                        backgroundColor: '#fff'
                      }}
                    >
                      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${brandTone.panelBorder}`, fontSize: '13px', fontWeight: 700, color: brandTone.ink }}>
                        经营摘要
                      </div>
                      <div style={{ padding: '14px 16px', display: 'grid', gap: '10px', fontSize: '13px', color: brandTone.muted }}>
                        <div>分类：{category?.name || '未分类'}</div>
                        <div>交付：{productType === 'service' ? '线上交付，无需收货地址' : '实物寄送，需要收货地址'}</div>
                        <div>规格：{productSkus.length > 0 ? `${productSkus.length} 个 SKU` : '单规格商品'}</div>
                        <div>橱窗：{(product.showcaseMedia || []).length > 0 ? `已配置 ${(product.showcaseMedia || []).length} 张` : '未配置橱窗图'}</div>
                      </div>
                    </div>

                    {productSkus.length > 0 && (
                      <div
                        style={{
                          borderRadius: '18px',
                          border: `1px solid ${brandTone.panelBorder}`,
                          backgroundColor: brandTone.subSurface,
                          padding: '14px'
                        }}
                      >
                        <div style={{ fontSize: '13px', fontWeight: 700, color: brandTone.ink, marginBottom: '10px' }}>SKU 速览</div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          {productSkus.slice(0, 4).map((sku) => (
                            <div
                              key={sku.id}
                              style={{
                                borderRadius: '14px',
                                backgroundColor: '#fff',
                                border: `1px solid ${brandTone.panelBorder}`,
                                padding: '12px'
                              }}
                            >
                              <div style={{ fontSize: '13px', fontWeight: 700, color: brandTone.ink }}>{sku.skuName || '默认规格'}</div>
                              <div style={{ marginTop: '6px', fontSize: '12px', color: brandTone.muted, lineHeight: 1.7 }}>
                                {formatCash(product.priceCash || 0)} · 库存 {sku.stock}
                              </div>
                            </div>
                          ))}
                          {productSkus.length > 4 && (
                            <div style={{ fontSize: '12px', color: brandTone.muted }}>
                              还有 {productSkus.length - 4} 个 SKU，可在编辑面板中查看。
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  if (mode === 'brand') {
    return (
      <div style={{ display: 'grid', gap: '24px' }}>
        {renderProductManagementSection()}
        {editingProduct !== null && (
          <ProductEditor
            categories={categories}
            allowedCategories={allowedCategoryOptions}
            currentBrandScopeTags={currentBrandScopeTags}
            isPrivilegedManager={isPrivilegedManager}
            isBrandLeadUser={isBrandLeadUser}
            isBrandMemberUser={isBrandMemberUser}
            categoryNameById={categoryNameById}
            products={products}
            draft={productDraft}
            saving={savingProduct}
            onClose={() => {
              setEditingProduct(null);
              setProductDraft(createProductDraft());
            }}
            onChange={handleProductDraftChange}
            onGalleryChange={handleGalleryChange}
            onAddGalleryItem={handleAddGalleryItem}
            onRemoveGalleryItem={handleRemoveGalleryItem}
            onUploadCoverImage={handleUploadCoverImage}
            onUploadGalleryImage={handleUploadGalleryImage}
            onUploadGalleryImages={handleUploadGalleryImages}
            uploadingCover={uploadingCover}
            uploadingGalleryIndex={uploadingGalleryIndex}
            uploadingGalleryBatch={uploadingGalleryBatch}
            onSkuChange={handleSkuChange}
            onAddSku={handleAddSku}
            onRemoveSku={handleRemoveSku}
            onSave={handleSaveProduct}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[
          { key: 'overview', label: '总览' },
          { key: 'partners', label: '合作伙伴' }
        ].map((item) => (
          <FilterButton key={item.key} active={adminSection === item.key} onClick={() => setAdminSection(item.key)}>
            {item.label}
          </FilterButton>
        ))}
      </div>

      {adminSection === 'overview' && (
        <>
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>工坊总览</h2>
            <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
              这里集中查看工坊分类、商品、规格和订单数据，并支持基础商品维护与订单状态流转。
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <StatCard label="分类数" value={categories.length} />
              <StatCard label="商品数" value={products.length} />
              <StatCard label="规格数" value={skus.length} />
              <StatCard label="订单数" value={orders.length} />
              <StatCard label="合作伙伴主订单" value={partnerOrders.length} />
              <StatCard label="合作伙伴子订单" value={partnerSubOrders.length} />
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>合作伙伴订单</h3>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {[
                  { key: 'all', label: '全部' },
                  { key: 'exception', label: '只看异常' },
                  { key: 'pending_payment', label: '待付款' },
                  { key: 'accepted', label: '已接单' },
                  { key: 'packing', label: '备货中' },
                  { key: 'shipped', label: '已发货' }
                ].map((item) => (
                  <FilterButton key={item.key} active={selectedPartnerStatus === item.key} onClick={() => setSelectedPartnerStatus(item.key)}>
                    {item.label}
                  </FilterButton>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '18px' }}>
              <StatCard label="异常主订单" value={partnerOrderSummary.exception} />
              <StatCard label="已接单子订单" value={partnerOrderSummary.accepted} />
              <StatCard label="备货中子订单" value={partnerOrderSummary.packing} />
              <StatCard label="已发货子订单" value={partnerOrderSummary.shipped} />
            </div>

            {filteredPartnerOrders.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>当前还没有合作伙伴订单。</div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {filteredPartnerOrders.map((order) => {
                  const subOrders = partnerSubOrders.filter((subOrder) => subOrder.partnerOrderId === order.id);
                  const abnormalSubOrders = subOrders.filter((subOrder) => !['shipped', 'completed', '已发货'].includes(subOrder.status || ''));

                  return (
                    <div
                      key={order.id}
                      style={{
                        borderRadius: '16px',
                        border: '1px solid #e5e7eb',
                        backgroundColor: '#f8fafc',
                        padding: '18px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{order.orderNo}</div>
                          <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                            角色：{order.roleType} · 提交时间：{order.submittedAt || '未知'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span
                            style={{
                              alignSelf: 'flex-start',
                              padding: '6px 10px',
                              borderRadius: '999px',
                              backgroundColor: abnormalSubOrders.length > 0 ? '#fef3c7' : '#dcfce7',
                              color: abnormalSubOrders.length > 0 ? '#92400e' : '#166534',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          >
                            {abnormalSubOrders.length > 0 ? `异常子订单 ${abnormalSubOrders.length}` : '正常'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#475569', marginBottom: '14px' }}>
                        <div>标价合计：¥{Number(order.listAmount || 0).toFixed(2)}</div>
                        <div>折后实付：¥{Number(order.payableAmount || 0).toFixed(2)} · 折扣：{Math.round(Number(order.discountRate || 1) * 100)} 折</div>
                      </div>

                      <div style={{ display: 'grid', gap: '8px' }}>
                        {subOrders.map((subOrder) => (
                          <div
                            key={subOrder.id}
                            style={{
                              borderRadius: '12px',
                              backgroundColor: '#fff',
                              padding: '12px 14px',
                              border: '1px solid #e5e7eb'
                            }}
                          >
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{subOrder.subOrderNo}</div>
                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                              {subOrder.category} · {subOrder.supplier} · x{subOrder.itemCount} · ¥{Number(subOrder.payableAmount || 0).toFixed(2)} · {subOrder.status}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                              {[
                                { key: 'accepted', label: '接单' },
                                { key: 'packing', label: '备货中' },
                                { key: 'shipped', label: '已发货' }
                              ].map((action) => (
                                <button
                                  key={action.key}
                                  type="button"
                                  disabled={updatingPartnerSubOrderId === subOrder.id}
                                  onClick={() => handlePartnerSubOrderStatusUpdate(subOrder.id, action.key)}
                                  style={{
                                    border: '1px solid #dbe4ee',
                                    borderRadius: '10px',
                                    backgroundColor: '#fff',
                                    color: '#334155',
                                    padding: '8px 10px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: updatingPartnerSubOrderId === subOrder.id ? 'default' : 'pointer',
                                    opacity: updatingPartnerSubOrderId === subOrder.id ? 0.6 : 1
                                  }}
                                >
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>我的居心地</h3>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
                  小程序【工坊】首页轮播图，固定上传尺寸建议为 700 × 700 px。每张图中心会绘制一个可点击圆形，点击后进入这里绑定的商品。
                </div>
              </div>
              <button
                type="button"
                onClick={() => { void handleSaveLivingSettings(); }}
                disabled={savingShopHomeLivingSettings}
                style={{
                  border: 'none',
                  borderRadius: '10px',
                  backgroundColor: '#111827',
                  color: '#fff',
                  padding: '12px 18px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: savingShopHomeLivingSettings ? 'default' : 'pointer',
                  opacity: savingShopHomeLivingSettings ? 0.7 : 1
                }}
              >
                {savingShopHomeLivingSettings ? '保存中...' : '保存居心地设置'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '18px' }}>
              {livingCardsDraft.map((card, index) => (
                <div
                  key={card.id}
                  style={{
                    borderRadius: '16px',
                    border: '1px solid #e5e7eb',
                    backgroundColor: '#f8fafc',
                    padding: '16px'
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '10px' }}>
                    轮播图 {index + 1}
                  </div>
                  <div style={{ ...imagePreviewFrameStyle, width: '100%', aspectRatio: '1 / 1', marginBottom: '12px' }}>
                    {card.imageUrl ? (
                      <img src={card.imageUrl} alt={`居心地轮播 ${index + 1}`} style={imagePreviewStyle} />
                    ) : (
                      <div style={imagePlaceholderStyle}>700 × 700</div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gap: '10px' }}>
                    <label style={uploadActionStyle}>
                      {uploadingLivingCardIndex === index ? '上传中...' : '上传图片'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingLivingCardIndex === index}
                        style={{ display: 'none' }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          void handleUploadLivingCardImage(index, file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                    <Field label="绑定商品">
                      <select
                        value={card.productId || ''}
                        onChange={(event) => handleLivingCardChange(index, { productId: event.target.value })}
                        style={inputStyle}
                      >
                        <option value="">暂不绑定</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {renderProductManagementSection()}

          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '20px', color: '#111827' }}>订单列表</h3>

            {orderError && (
              <div style={{
                marginBottom: '16px',
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '13px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{orderError}</span>
                <button
                  type="button"
                  onClick={() => setOrderError('')}
                  style={{
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    color: '#b91c1c',
                    fontSize: '14px',
                    fontWeight: 700,
                    padding: '2px 6px'
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {orders.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>当前还没有工坊订单。</div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {orders.map((order) => (
                  <div
                    key={order.id}
                    style={{
                      borderRadius: '16px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#f8fafc',
                      padding: '18px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>{order.orderNo}</div>
                        <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                          用户：{resolveUserUid(order.userId)} · 创建时间：{order.createdAt || '未知'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span
                          style={{
                            alignSelf: 'flex-start',
                            padding: '6px 10px',
                            borderRadius: '999px',
                            backgroundColor: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                        >
                          {statusLabelMap[order.status] || order.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingOrder(order)}
                          style={{
                            border: '1px solid #e5e7eb',
                            borderRadius: '10px',
                            backgroundColor: '#fff',
                            color: '#0f172a',
                            padding: '6px 10px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          编辑
                        </button>
                        {renderOrderActions(order, updatingOrderId, handleOrderStatusUpdate)}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#475569', marginBottom: '14px' }}>
                      <div>订单类型：{order.orderType}</div>
                      <div>总额：{order.totalPoints} 福豆 · {formatCash(order.totalCash)}</div>
                      <div>已发放返豆：{(order.rewardPointsAwarded || 0) + (order.badgeBonusPointsAwarded || 0)} 福豆</div>
                      <div>支付时间：{order.paidAt || '未支付'}</div>
                    </div>

                    <div style={{ display: 'grid', gap: '8px' }}>
                      {(orderItemsByOrderId.get(order.id) || []).map((item) => (
                        <div
                          key={item.id}
                          style={{
                            borderRadius: '12px',
                            backgroundColor: '#fff',
                            padding: '12px 14px',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{item.productName}</div>
                          <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                            {item.skuName || '默认规格'} · x{item.quantity} · {item.subtotalPoints} 福豆 · {formatCash(item.subtotalCash)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {adminSection === 'partners' && (
        <div style={{ display: 'grid', gap: '24px' }}>
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#333' }}>合作伙伴总览</h2>
            <p style={{ margin: '0 0 24px', color: '#666', fontSize: '14px', lineHeight: 1.6 }}>
              查看代理商与品牌方店铺，并可直接为品牌方店铺调整社区福豆余额。
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
              <StatCard label="代理商数量" value={partnerAgentUsers.length} />
              <StatCard label="品牌方店铺数量" value={partnerBrands.length} />
              <StatCard label="品牌方成员数量" value={partnerBrandMembers.length} />
              <StatCard label="品牌方邀请记录" value={partnerBrandInvites.length} />
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '20px', color: '#111827' }}>代理商列表</h3>
            {partnerAgentUsers.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>当前还没有代理商用户。</div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {partnerAgentUsers.map((user) => (
                  <div
                    key={user.id}
                    style={{
                      borderRadius: '14px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#f8fafc',
                      padding: '14px 16px',
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 0.9fr 0.9fr',
                      gap: '12px',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>{user.name || `uid=${user.uid || '未知'}`}</div>
                      <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>uid={user.uid || '未知'} · {user.phone || '未绑定手机'}</div>
                    </div>
                    <div style={{ fontSize: '13px', color: '#334155' }}>当前福豆：{Number(user.balance || 0)}</div>
                    <div style={{ fontSize: '13px', color: '#64748b' }}>关联店铺：{user.storeName || '未绑定'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)'
            }}
          >
            <h3 style={{ margin: '0 0 16px', fontSize: '20px', color: '#111827' }}>品牌方店铺列表</h3>
            {partnerBrands.length === 0 ? (
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>当前还没有品牌方店铺。</div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {partnerBrands.map((brand) => (
                  <div
                    key={brand.id}
                    style={{
                      borderRadius: '14px',
                      border: '1px solid #e5e7eb',
                      backgroundColor: '#f8fafc',
                      padding: '16px',
                      display: 'grid',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{brand.name || '未命名店铺'}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                          店铺标识：{brand.slug || '未设置'} · 主理人：{brandOwnerNameByBrandId.get(brand.id) || '未绑定'}
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#334155' }}>
                        成员数：{(brandMembersByBrandId.get(brand.id) || []).length}
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                        店铺福豆：{Math.max(0, Number(brand.communityBeansBalance || 0))}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[100, 500, -100, -500].map((delta) => (
                          <button
                            key={`${brand.id}_${delta}`}
                            type="button"
                            disabled={adjustingBrandId === brand.id}
                            onClick={() => { void handleAdjustPartnerBrandCommunityBeansBalance(brand, delta); }}
                            style={{
                              border: '1px solid #dbe4ee',
                              borderRadius: '10px',
                              backgroundColor: delta > 0 ? '#ecfdf3' : '#fff7ed',
                              color: delta > 0 ? '#166534' : '#9a3412',
                              padding: '8px 12px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: adjustingBrandId === brand.id ? 'default' : 'pointer',
                              opacity: adjustingBrandId === brand.id ? 0.7 : 1
                            }}
                          >
                            {delta > 0 ? `+${delta}` : `${delta}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editingProduct !== null && (
        <ProductEditor
          categories={categories}
          allowedCategories={allowedCategoryOptions}
          currentBrandScopeTags={currentBrandScopeTags}
          isPrivilegedManager={isPrivilegedManager}
          isBrandLeadUser={isBrandLeadUser}
          isBrandMemberUser={isBrandMemberUser}
          categoryNameById={categoryNameById}
          products={products}
          draft={productDraft}
          saving={savingProduct}
          onClose={() => {
            setEditingProduct(null);
            setProductDraft(createProductDraft());
          }}
          onChange={handleProductDraftChange}
          onGalleryChange={handleGalleryChange}
          onAddGalleryItem={handleAddGalleryItem}
          onRemoveGalleryItem={handleRemoveGalleryItem}
          onUploadCoverImage={handleUploadCoverImage}
          onUploadGalleryImage={handleUploadGalleryImage}
          onUploadGalleryImages={handleUploadGalleryImages}
          uploadingCover={uploadingCover}
          uploadingGalleryIndex={uploadingGalleryIndex}
          uploadingGalleryBatch={uploadingGalleryBatch}
          onSkuChange={handleSkuChange}
          onAddSku={handleAddSku}
          onRemoveSku={handleRemoveSku}
          onSave={handleSaveProduct}
        />
      )}

      {editingOrder !== null && (
        <OrderEditor
          order={editingOrder}
          orderItems={orderItemsByOrderId.get(editingOrder.id) || []}
          statusLabels={statusLabelMap}
          updatingOrderId={updatingOrderId}
          resolveUserUid={resolveUserUid}
          onClose={() => setEditingOrder(null)}
          onUpdateStatus={(nextStatus) => handleOrderStatusUpdate(editingOrder.id || editingOrder.orderNo, nextStatus)}
        />
      )}
    </div>
  );
};

const renderOrderActions = (order, updatingOrderId, onUpdate) => {
  const actionOrderId = order.id || order.orderNo;
  const buttonStyle = {
    border: 'none',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: updatingOrderId === actionOrderId ? 'default' : 'pointer',
    backgroundColor: '#fff',
    color: '#0f172a',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: '#e5e7eb'
  };

  if (order.status === 'paid') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'processing')}>
          进入处理
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'cancelled')}>
          取消并退款
        </button>
      </>
    );
  }

  if (order.status === 'pending_payment') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'paid')}>
          确认已支付
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'cancelled')}>
          取消订单
        </button>
      </>
    );
  }

  if (order.status === 'processing') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'shipped')}>
          标记发货
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'refunded')}>
          退款
        </button>
      </>
    );
  }

  if (order.status === 'shipped') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'completed')}>
          完成订单
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === actionOrderId} onClick={() => onUpdate(actionOrderId, 'refunded')}>
          退款
        </button>
      </>
    );
  }

  // Terminal states: show reopen actions
  if (order.status === 'completed' || order.status === 'refunded' || order.status === 'cancelled') {
    return (
      <button
        type="button"
        style={{ ...buttonStyle, color: '#9a3412', borderColor: '#fed7aa', backgroundColor: '#fff7ed' }}
        disabled={updatingOrderId === actionOrderId}
        onClick={() => onUpdate(actionOrderId, 'processing')}
      >
        重新打开
      </button>
    );
  }

  return null;
};

export const ProductEditor = ({
  categories,
  allowedCategories,
  currentBrandScopeTags,
  isPrivilegedManager,
  isBrandLeadUser,
  isBrandMemberUser,
  categoryNameById,
  products,
  draft,
  saving,
  onClose,
  onChange,
  onGalleryChange,
  onAddGalleryItem,
  onRemoveGalleryItem,
  onUploadCoverImage,
  onUploadGalleryImage,
  onUploadGalleryImages,
  uploadingCover,
  uploadingGalleryIndex,
  uploadingGalleryBatch,
  onSkuChange,
  onAddSku,
  onRemoveSku,
  onSave
}) => {
  const deliveryLabel = resolveProductTypeByCategoryName(categoryNameById.get(draft.categoryId) || '') === 'service'
    ? '线上交付，无需填写收货地址'
    : '实物寄送，需要收货地址';

  const basicSummaryItems = [
    { label: 'SKU 数量', value: `${draft.skus.length}` },
    { label: '图库张数', value: `${draft.gallery.filter((item) => item.url).length}` },
    { label: '商品价格', value: `${formatCash(draft.priceCash || 0)}` },
    { label: '福豆抵用上限', value: `${Math.round(Number(draft.beansDeductionRatio || 0) * 100)}%` },
    { label: '总库存', value: `${draft.stockTotal || 0}` }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 120
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '980px',
          maxHeight: '90vh',
          overflowY: 'auto',
          backgroundColor: '#fff',
          borderRadius: '24px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
          overflowX: 'hidden'
        }}
      >
        <div
          style={{
            padding: '24px 28px',
            borderBottom: '1px solid #eef2f7',
            background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                商品编辑器
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '28px', color: '#111827' }}>{draft.id ? '编辑商品' : '新建商品'}</h3>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b', lineHeight: 1.8 }}>
                  分类将自动决定交付方式，图库可直接配置橱窗素材，SKU 区域负责价格与库存的最终落点。
                </div>
              </div>
            </div>
            <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', fontSize: '14px', fontWeight: 700 }}>
              关闭
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginTop: '20px' }}>
            {basicSummaryItems.map((item) => (
              <div key={item.label} style={editorMetricStyle}>
                <div style={editorMetricLabelStyle}>{item.label}</div>
                <div style={editorMetricValueStyle}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '24px 28px', display: 'grid', gap: '18px' }}>
          <EditorSection title="基础信息" description="先确认商品名称、封面、分类和对外描述。">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: '18px' }}>
              <div style={editorPreviewCardStyle}>
                <div style={{ ...imagePreviewFrameStyle, aspectRatio: '3 / 4', backgroundColor: '#f1f5f9' }}>
                  {draft.coverImage ? (
                    <img src={draft.coverImage} alt="商品封面" style={imagePreviewStyle} />
                  ) : (
                    <div style={imagePlaceholderStyle}>封面预览</div>
                  )}
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={uploadActionStyle}>
                    {uploadingCover ? '上传中...' : '上传封面图'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingCover}
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        void onUploadCoverImage(file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.7 }}>
                    封面图用于商品列表、详情页和橱窗首图，建议使用主体明确的竖版或方图。
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: '12px' }}>
                <Field label="商品名称">
                  <input value={draft.name} onChange={(event) => onChange('name', event.target.value)} style={inputStyle} />
                </Field>
                <Field label="副标题">
                  <input value={draft.subtitle} onChange={(event) => onChange('subtitle', event.target.value)} style={inputStyle} />
                </Field>
                <Field label="品牌方品类权限">
                  {isPrivilegedManager ? (
                    <>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {BRAND_SCOPE_OPTIONS.map((option) => {
                          const active = (draft.brandScopes || []).includes(option.tagName);
                          return (
                            <button
                              key={option.tagName}
                              type="button"
                              onClick={() => {
                                const nextScopes = active
                                  ? (draft.brandScopes || []).filter((item) => item !== option.tagName)
                                  : [...(draft.brandScopes || []), option.tagName];
                                onChange('brandScopes', nextScopes);
                              }}
                              style={{
                                border: `1px solid ${active ? '#111827' : '#dbe4ee'}`,
                                borderRadius: '999px',
                                padding: '10px 14px',
                                backgroundColor: active ? '#111827' : '#f8fafc',
                                color: active ? '#fff' : '#334155',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 700
                              }}
                            >
                              {option.tagName}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', lineHeight: 1.7 }}>
                        选择一个或多个品牌方子标签后，只允许发布对应商品分类。
                      </div>
                    </>
                  ) : (
                    <div style={editorNoticeStyle}>
                      当前{isBrandLeadUser ? '品牌方主理人' : isBrandMemberUser ? '品牌方成员' : '品牌方'}已绑定：{currentBrandScopeTags.join('、') || '未绑定'}。发布分类将自动限制为对应品类。
                    </div>
                  )}
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                  <Field label="分类">
                    <select value={draft.categoryId} onChange={(event) => onChange('categoryId', event.target.value)} style={inputStyle}>
                      <option value="">请选择分类</option>
                      {(allowedCategories || categories).map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="相关商品">
                    <select value={draft.relatedProductId} onChange={(event) => onChange('relatedProductId', event.target.value)} style={inputStyle}>
                      <option value="">不设置相关商品</option>
                      {products
                        .filter((product) => product.id !== draft.id)
                        .map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                    </select>
                  </Field>
                </div>
                <div style={editorNoticeStyle}>
                  当前交付方式将按分类自动推导：{deliveryLabel}
                </div>
                <Field label="描述">
                  <textarea value={draft.description} onChange={(event) => onChange('description', event.target.value)} style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }} />
                </Field>
              </div>
            </div>
          </EditorSection>

          <EditorSection title="经营参数" description="这些字段决定商品售卖门槛、返豆力度与库存边界。">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
              <Field label="商品价格（人民币）">
                <input type="number" value={draft.priceCash} onChange={(event) => onChange('priceCash', event.target.value)} style={inputStyle} />
              </Field>
              <Field label="福豆抵用比例上限">
                <input type="number" min="0" max="1" step="0.01" value={draft.beansDeductionRatio} onChange={(event) => onChange('beansDeductionRatio', event.target.value)} style={inputStyle} />
              </Field>
              <Field label="库存总数">
                <input type="number" value={draft.stockTotal} onChange={(event) => onChange('stockTotal', event.target.value)} style={inputStyle} />
              </Field>
              <Field label="限购">
                <input type="number" value={draft.limitPerUser} onChange={(event) => onChange('limitPerUser', event.target.value)} style={inputStyle} />
              </Field>
              <Field label="排序">
                <input type="number" value={draft.sortOrder} onChange={(event) => onChange('sortOrder', event.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px)', gap: '12px' }}>
              <Field label="状态">
                <select value={draft.status} onChange={(event) => onChange('status', event.target.value)} style={inputStyle}>
                  <option value="draft">草稿</option>
                  <option value="active">上架中</option>
                  <option value="archived">已归档</option>
                  <option value="sold_out">已售罄</option>
                </select>
              </Field>
            </div>
          </EditorSection>

          <EditorSection title="商品图片" description="支持批量上传，橱窗图会进入首页和运营位展示。">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
                已上传 {draft.gallery.filter((item) => item.url).length} 张图片，建议至少保留 1 张封面延展图与 1 张细节图。
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ ...uploadActionStyle, minWidth: 'auto' }}>
                  {uploadingGalleryBatch ? '批量上传中...' : '批量上传'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={uploadingGalleryBatch}
                    style={{ display: 'none' }}
                    onChange={(event) => {
                      void onUploadGalleryImages(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </label>
                <button type="button" onClick={onAddGalleryItem} style={miniButtonStyle}>新增空位</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {draft.gallery.map((item, index) => (
                <div key={item.id} style={editorSubPanelStyle}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.2fr) minmax(130px, 0.7fr) minmax(130px, 0.7fr) auto', gap: '12px', alignItems: 'end' }}>
                    <Field label={`商品图片 ${index + 1}`}>
                      <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={imagePreviewFrameStyle}>
                          {item.url ? (
                            <img src={item.url} alt={`商品图片 ${index + 1}`} style={imagePreviewStyle} />
                          ) : (
                            <div style={imagePlaceholderStyle}>未上传</div>
                          )}
                        </div>
                        <label style={uploadActionStyle}>
                          {uploadingGalleryIndex === index ? '上传中...' : '上传商品图'}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingGalleryIndex === index}
                            style={{ display: 'none' }}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              void onUploadGalleryImage(index, file);
                              event.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    </Field>
                    <Field label="设为橱窗">
                      <select value={item.showcaseEnabled ? 'yes' : 'no'} onChange={(event) => onGalleryChange(index, 'showcaseEnabled', event.target.value === 'yes')} style={inputStyle}>
                        <option value="no">否</option>
                        <option value="yes">是</option>
                      </select>
                    </Field>
                    <Field label="自动比例">
                      <div style={readonlyInfoStyle}>
                        {item.url ? (item.showcaseAspectRatio || '待识别') : '待识别'}
                      </div>
                    </Field>
                    <button type="button" onClick={() => onRemoveGalleryItem(index)} style={miniButtonStyle}>删除</button>
                  </div>
                </div>
              ))}
            </div>
          </EditorSection>

          <EditorSection title="规格 SKU" description="每个 SKU 对应规格名、编码和可售库存。成交价格与福豆抵用上限由商品级参数统一决定。">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                当前共 {draft.skus.length} 个 SKU。
              </div>
              <button type="button" onClick={onAddSku} style={miniButtonStyle}>新增规格</button>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {draft.skus.map((sku, index) => (
                <div key={`${sku.id || 'new'}-${index}`} style={editorSubPanelStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
                      规格 {index + 1}
                    </div>
                    <button type="button" onClick={() => onRemoveSku(index)} style={miniButtonStyle}>
                      删除
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: '12px', alignItems: 'end' }}>
                    <Field label="规格名">
                      <input value={sku.skuName} onChange={(event) => onSkuChange(index, 'skuName', event.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="SKU 编码">
                      <input value={sku.skuCode} onChange={(event) => onSkuChange(index, 'skuCode', event.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="库存">
                      <input type="number" value={sku.stock} onChange={(event) => onSkuChange(index, 'stock', event.target.value)} style={inputStyle} />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </EditorSection>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '0 28px 24px' }}>
          <button type="button" onClick={onClose} style={{ ...miniButtonStyle, backgroundColor: '#fff' }}>取消</button>
          <button type="button" onClick={onSave} disabled={saving} style={{ ...miniButtonStyle, backgroundColor: '#111827', color: '#fff', borderColor: '#111827', padding: '12px 18px' }}>
            {saving ? '保存中...' : '保存商品'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#475569' }}>
    <span>{label}</span>
    {children}
  </label>
);

const EditorSection = ({ title, description, children }) => (
  <section
    style={{
      borderRadius: '20px',
      border: '1px solid #e8eef5',
      backgroundColor: '#fff',
      overflow: 'hidden'
    }}
  >
    <div
      style={{
        padding: '18px 20px',
        borderBottom: '1px solid #eef2f7',
        backgroundColor: '#fbfdff'
      }}
    >
      <div style={{ fontSize: '16px', fontWeight: 800, color: '#111827' }}>{title}</div>
      {description && (
        <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
          {description}
        </div>
      )}
    </div>
    <div style={{ padding: '20px', display: 'grid', gap: '16px' }}>
      {children}
    </div>
  </section>
);

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '12px',
  border: '1px solid #dbe4ee',
  padding: '11px 12px',
  fontSize: '14px',
  color: '#0f172a',
  backgroundColor: '#fff'
};

const readonlyInfoStyle = {
  ...inputStyle,
  backgroundColor: '#f8fafc',
  color: '#334155',
  minHeight: '42px',
  display: 'flex',
  alignItems: 'center'
};

const imagePreviewFrameStyle = {
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: '12px',
  overflow: 'hidden',
  backgroundColor: '#e5e7eb'
};

const imagePreviewStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block'
};

const imagePlaceholderStyle = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#64748b',
  fontSize: '12px'
};

const uploadActionStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '11px 12px',
  borderRadius: '12px',
  border: '1px solid #dbe4ee',
  backgroundColor: '#fff',
  color: '#334155',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer'
};

const miniButtonStyle = {
  border: '1px solid #dbe4ee',
  borderRadius: '12px',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  backgroundColor: '#f8fafc',
  color: '#334155'
};

const editorMetricStyle = {
  borderRadius: '16px',
  backgroundColor: '#fff',
  border: '1px solid #e4ebf2',
  padding: '14px 16px'
};

const editorMetricLabelStyle = {
  fontSize: '12px',
  color: '#64748b'
};

const editorMetricValueStyle = {
  marginTop: '8px',
  fontSize: '16px',
  lineHeight: 1.4,
  fontWeight: 800,
  color: '#0f172a'
};

const editorPreviewCardStyle = {
  display: 'grid',
  gap: '12px',
  padding: '16px',
  borderRadius: '18px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e8eef5',
  alignSelf: 'start'
};

const editorSubPanelStyle = {
  borderRadius: '16px',
  border: '1px solid #e5e7eb',
  backgroundColor: '#f8fafc',
  padding: '14px'
};

const editorNoticeStyle = {
  borderRadius: '14px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e8eef5',
  padding: '12px 14px',
  fontSize: '12px',
  color: '#64748b',
  lineHeight: 1.8
};

const StatCard = ({ label, value }) => (
  <div
    style={{
      borderRadius: '14px',
      backgroundColor: '#f8fafc',
      padding: '20px'
    }}
  >
    <div style={{ fontSize: '13px', color: '#64748b' }}>{label}</div>
    <div style={{ marginTop: '8px', fontSize: '28px', fontWeight: 700, color: '#0f172a' }}>{value}</div>
  </div>
);

const BrandMetricCard = ({ label, value, hint, tone = 'default' }) => {
  const toneMap = {
    default: {
      background: '#ffffff',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      valueColor: '#0f172a'
    },
    success: {
      background: '#f0fdf4',
      borderColor: 'rgba(34, 197, 94, 0.18)',
      valueColor: '#166534'
    },
    warning: {
      background: '#fff7ed',
      borderColor: 'rgba(249, 115, 22, 0.18)',
      valueColor: '#9a3412'
    },
    danger: {
      background: '#fef2f2',
      borderColor: 'rgba(239, 68, 68, 0.18)',
      valueColor: '#b91c1c'
    },
    accent: {
      background: '#fffaf1',
      borderColor: 'rgba(154, 52, 18, 0.16)',
      valueColor: '#7c2d12'
    }
  };

  const currentTone = toneMap[tone] || toneMap.default;

  return (
    <div
      style={{
        borderRadius: '18px',
        backgroundColor: currentTone.background,
        border: `1px solid ${currentTone.borderColor}`,
        padding: '16px'
      }}
    >
      <div style={{ fontSize: '12px', color: '#64748b' }}>{label}</div>
      <div style={{ marginTop: '10px', fontSize: '28px', lineHeight: 1, fontWeight: 800, color: currentTone.valueColor }}>{value}</div>
      <div style={{ marginTop: '10px', fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>{hint}</div>
    </div>
  );
};

const FilterButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      border: active ? '1px solid #111827' : '1px solid #dbe4ee',
      borderRadius: '999px',
      padding: '10px 14px',
      backgroundColor: active ? '#111827' : '#fff',
      color: active ? '#fff' : '#475569',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 700
    }}
  >
    {children}
  </button>
);

export default ShopManagement;

const OrderEditor = ({ order, orderItems, statusLabels, updatingOrderId, onClose, onUpdateStatus, resolveUserUid }) => {
  const orderId = order.id || order.orderNo;
  const isUpdating = updatingOrderId === orderId;
  const [localError, setLocalError] = React.useState('');

  const handleStatusUpdate = async (nextStatus) => {
    setLocalError('');
    try {
      await onUpdateStatus(nextStatus);
    } catch (err) {
      setLocalError(err?.message || String(err));
    }
  };

  const detailRows = [
    { label: '订单编号', value: order.orderNo || '未设置' },
    { label: '用户 ID', value: resolveUserUid ? resolveUserUid(order.userId) : (order.userId || '未知') },
    { label: '订单类型', value: order.orderType || '未知' },
    { label: '当前状态', value: statusLabels[order.status] || order.status || '未知' },
    { label: '总额', value: `${order.totalPoints || 0} 福豆 · ¥${Number(order.totalCash || 0).toFixed(2)}` },
    { label: '已发返豆', value: `${(order.rewardPointsAwarded || 0) + (order.badgeBonusPointsAwarded || 0)} 福豆` },
    { label: '创建时间', value: order.createdAt || '未知' },
    { label: '支付时间', value: order.paidAt || '未支付' }
  ];

  const statusOptions = [
    { key: 'pending_payment', label: '待支付' },
    { key: 'paid', label: '已支付' },
    { key: 'processing', label: '处理中' },
    { key: 'shipped', label: '已发货' },
    { key: 'completed', label: '已完成' },
    { key: 'cancelled', label: '已取消' },
    { key: 'refunded', label: '已退款' }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        zIndex: 120
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '600px',
          maxHeight: '85vh',
          overflowY: 'auto',
          backgroundColor: '#fff',
          borderRadius: '20px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.22)',
          padding: '28px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
              订单详情
            </div>
            <h3 style={{ margin: 0, fontSize: '24px', color: '#111827' }}>{order.orderNo || '编辑订单'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: '#64748b',
              fontSize: '14px',
              fontWeight: 700
            }}
          >
            关闭
          </button>
        </div>

        <div style={{ display: 'grid', gap: '12px', marginBottom: '24px' }}>
          {detailRows.map((row) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e5e7eb'
              }}
            >
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>{row.label}</span>
              <span style={{ fontSize: '14px', color: '#0f172a', fontWeight: 700 }}>{row.value}</span>
            </div>
          ))}
        </div>

        {orderItems.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '10px' }}>订单商品</div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {orderItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: '12px',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e5e7eb',
                    padding: '12px 14px'
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{item.productName}</div>
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                    {item.skuName || '默认规格'} · x{item.quantity} · {item.subtotalPoints} 福豆 · ¥{Number(item.subtotalCash || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '18px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '12px' }}>修改状态</div>

          {localError && (
            <div style={{
              marginBottom: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '13px'
            }}>
              {localError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {statusOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={isUpdating || order.status === option.key}
                onClick={() => handleStatusUpdate(option.key)}
                style={{
                  border: order.status === option.key ? '1px solid #111827' : '1px solid #dbe4ee',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  backgroundColor: order.status === option.key ? '#111827' : '#fff',
                  color: order.status === option.key ? '#fff' : '#334155',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isUpdating || order.status === option.key ? 'default' : 'pointer',
                  opacity: order.status === option.key ? 1 : (isUpdating ? 0.5 : 1)
                }}
              >
                {option.label}{order.status === option.key ? ' ✓' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
