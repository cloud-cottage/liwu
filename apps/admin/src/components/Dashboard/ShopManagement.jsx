import React, { useMemo, useState } from 'react';
import { uploadImageAsWebp } from '../../utils/imageUpload.js';

const formatCash = (value) => (value ? `¥${Number(value).toFixed(2)}` : '纯福豆');

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

const createEmptySku = () => ({
  id: '',
  skuName: '',
  skuCode: '',
  pricePoints: 0,
  priceCash: 0,
  rewardPointsReturn: 0,
  stock: 0,
  status: 'active'
});

const createEmptyGalleryItem = () => ({
  id: `gallery_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  url: '',
  showcaseEnabled: false,
  showcaseAspectRatio: ''
});

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

const createProductDraft = (product = null, skus = []) => ({
  id: product?.id || '',
  name: product?.name || '',
  subtitle: product?.subtitle || '',
  categoryId: product?.categoryId || '',
  productType: product?.productType || 'physical',
  coverImage: product?.coverImage || '',
  description: product?.description || '',
  status: product?.status || 'draft',
  skuMode: product?.skuMode || 'single',
  pricePointsFrom: product?.pricePointsFrom || 0,
  priceCashFrom: product?.priceCashFrom || 0,
  rewardPointsReturnFrom: product?.rewardPointsReturnFrom || 0,
  stockTotal: product?.stockTotal || 0,
  salesCount: product?.salesCount || 0,
  limitPerUser: product?.limitPerUser || 0,
  sortOrder: product?.sortOrder || 0,
  gallery: normalizeGalleryItems(product),
  skus: skus.length > 0 ? skus.map((sku) => ({ ...sku })) : [createEmptySku()]
});

const ShopManagement = ({
  categories,
  products,
  skus,
  orders,
  orderItems,
  onSaveProduct,
  onUpdateOrderStatus
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [editingProduct, setEditingProduct] = useState(null);
  const [productDraft, setProductDraft] = useState(() => createProductDraft());
  const [savingProduct, setSavingProduct] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingGalleryIndex, setUploadingGalleryIndex] = useState(-1);
  const [uploadingGalleryBatch, setUploadingGalleryBatch] = useState(false);

  const filteredProducts = useMemo(() => (
    selectedCategoryId
      ? products.filter((product) => product.categoryId === selectedCategoryId)
      : products
  ), [products, selectedCategoryId]);

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

  const handleEditProduct = (product) => {
    const productSkus = skusByProductId.get(product.id) || [];
    setEditingProduct(product);
    setProductDraft(createProductDraft(product, productSkus));
  };

  const handleCreateProduct = () => {
    setEditingProduct({});
    setProductDraft(createProductDraft());
  };

  const handleProductDraftChange = (field, value) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      [field]: ['pricePointsFrom', 'priceCashFrom', 'rewardPointsReturnFrom', 'stockTotal', 'salesCount', 'limitPerUser', 'sortOrder'].includes(field)
        ? Number(value || 0)
        : value
    }));
  };

  const handleSkuChange = (index, field, value) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      skus: currentDraft.skus.map((sku, skuIndex) => (
        skuIndex === index
          ? {
              ...sku,
              [field]: ['pricePoints', 'priceCash', 'rewardPointsReturn', 'stock'].includes(field) ? Number(value || 0) : value
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

  const handleOrderStatusUpdate = async (orderId, nextStatus) => {
    setUpdatingOrderId(orderId);
    await onUpdateOrderStatus(orderId, nextStatus);
    setUpdatingOrderId('');
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
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
          <h3 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>商品与分类</h3>
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

        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredProducts.map((product) => {
            const productSkus = skusByProductId.get(product.id) || [];
            const category = categories.find((item) => item.id === product.categoryId);

            return (
              <div
                key={product.id}
                style={{
                  borderRadius: '16px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f8fafc',
                  padding: '18px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{product.name}</div>
                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
                      {product.subtitle || product.description || '暂无商品描述'}
                    </div>
                    {(product.showcaseMedia || []).length > 0 && (
                      <div style={{ marginTop: '8px', fontSize: '12px', color: '#8f5d2f', fontWeight: 600 }}>
                        橱窗图 {product.showcaseMedia.length} 张
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span
                      style={{
                        alignSelf: 'flex-start',
                        padding: '6px 10px',
                        borderRadius: '999px',
                        backgroundColor: '#e2e8f0',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      {statusLabelMap[product.status] || product.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleEditProduct(product)}
                      style={{
                        border: 'none',
                        borderRadius: '10px',
                        backgroundColor: '#fff',
                        color: '#111827',
                        padding: '10px 14px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderStyle: 'solid',
                        borderWidth: '1px',
                        borderColor: '#e5e7eb'
                      }}
                    >
                      编辑
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#475569', marginBottom: '14px' }}>
                  <div>分类：{category?.name || '未分类'}</div>
                  <div>价格：{product.pricePointsFrom} 福豆 · {formatCash(product.priceCashFrom)}</div>
                  <div>返豆：{product.rewardPointsReturnFrom || 0} 福豆起</div>
                  <div>库存：{product.stockTotal} · 销量：{product.salesCount} · 限购：{product.limitPerUser || '不限'}</div>
                </div>

                {productSkus.length > 0 && (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {productSkus.map((sku) => (
                      <div
                        key={sku.id}
                        style={{
                          borderRadius: '12px',
                          backgroundColor: '#fff',
                          padding: '12px 14px',
                          border: '1px solid #e5e7eb'
                        }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{sku.skuName || '默认规格'}</div>
                        <div style={{ marginTop: '4px', fontSize: '12px', color: '#64748b' }}>
                          {sku.pricePoints} 福豆 · {formatCash(sku.priceCash)} · 返 {sku.rewardPointsReturn || 0} 福豆 · 库存 {sku.stock}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
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
        <h3 style={{ margin: '0 0 16px', fontSize: '20px', color: '#111827' }}>订单列表</h3>

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
                      用户：{order.userId} · 创建时间：{order.createdAt || '未知'}
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
                    {renderOrderActions(order, updatingOrderId, handleOrderStatusUpdate)}
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#475569', marginBottom: '14px' }}>
                  <div>订单类型：{order.orderType}</div>
                  <div>总额：{order.totalPoints} 福豆 · {formatCash(order.totalCash)}</div>
                  <div>返豆：{order.rewardPointsReturnTotal || 0} 福豆 · 已发放：{(order.rewardPointsAwarded || 0) + (order.badgeBonusPointsAwarded || 0)} 福豆</div>
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
                        {item.skuName || '默认规格'} · x{item.quantity} · {item.subtotalPoints} 福豆 · {formatCash(item.subtotalCash)} · 返 {item.rewardPointsReturn || 0} 福豆
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingProduct !== null && (
        <ProductEditor
          categories={categories}
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
};

const renderOrderActions = (order, updatingOrderId, onUpdate) => {
  const buttonStyle = {
    border: 'none',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: updatingOrderId === order.id ? 'default' : 'pointer',
    backgroundColor: '#fff',
    color: '#0f172a',
    borderStyle: 'solid',
    borderWidth: '1px',
    borderColor: '#e5e7eb'
  };

  if (order.status === 'paid') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'processing')}>
          进入处理
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'cancelled')}>
          取消并退款
        </button>
      </>
    );
  }

  if (order.status === 'pending_payment') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'paid')}>
          确认已支付
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'cancelled')}>
          取消订单
        </button>
      </>
    );
  }

  if (order.status === 'processing') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'shipped')}>
          标记发货
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'refunded')}>
          退款
        </button>
      </>
    );
  }

  if (order.status === 'shipped') {
    return (
      <>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'completed')}>
          完成订单
        </button>
        <button type="button" style={buttonStyle} disabled={updatingOrderId === order.id} onClick={() => onUpdate(order.id, 'refunded')}>
          退款
        </button>
      </>
    );
  }

  return null;
};

const ProductEditor = ({
  categories,
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
}) => (
  <div
    style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      zIndex: 40
    }}
  >
    <div
      style={{
        width: '100%',
        maxWidth: '640px',
        maxHeight: '90vh',
        overflowY: 'auto',
        backgroundColor: '#fff',
        borderRadius: '18px',
        padding: '24px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '20px', color: '#111827' }}>{draft.id ? '编辑商品' : '新建商品'}</h3>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
          关闭
        </button>
      </div>

      <div style={{ display: 'grid', gap: '12px' }}>
        <Field label="商品名称">
          <input value={draft.name} onChange={(event) => onChange('name', event.target.value)} style={inputStyle} />
        </Field>
        <div style={{ display: 'grid', gap: '6px' }}>
          <span style={{ fontSize: '13px', color: '#475569' }}>封面图</span>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '12px', alignItems: 'start' }}>
            <div style={imagePreviewFrameStyle}>
              {draft.coverImage ? (
                <img src={draft.coverImage} alt="商品封面" style={imagePreviewStyle} />
              ) : (
                <div style={imagePlaceholderStyle}>未上传</div>
              )}
            </div>
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
          </div>
        </div>
        <Field label="副标题">
          <input value={draft.subtitle} onChange={(event) => onChange('subtitle', event.target.value)} style={inputStyle} />
        </Field>
        <Field label="分类">
          <select value={draft.categoryId} onChange={(event) => onChange('categoryId', event.target.value)} style={inputStyle}>
            <option value="">请选择分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </Field>
        <Field label="商品类型">
          <select value={draft.productType} onChange={(event) => onChange('productType', event.target.value)} style={inputStyle}>
            <option value="physical">实物</option>
            <option value="digital">数字商品</option>
            <option value="service">服务</option>
          </select>
        </Field>
        <Field label="描述">
          <textarea value={draft.description} onChange={(event) => onChange('description', event.target.value)} style={{ ...inputStyle, minHeight: '120px' }} />
        </Field>

        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>商品图片</div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
          <div style={{ display: 'grid', gap: '10px' }}>
            {draft.gallery.map((item, index) => (
              <div key={item.id} style={{ borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#f8fafc', padding: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
          <Field label="福豆起价">
            <input type="number" value={draft.pricePointsFrom} onChange={(event) => onChange('pricePointsFrom', event.target.value)} style={inputStyle} />
          </Field>
          <Field label="现金起价">
            <input type="number" value={draft.priceCashFrom} onChange={(event) => onChange('priceCashFrom', event.target.value)} style={inputStyle} />
          </Field>
          <Field label="返豆起始值">
            <input type="number" value={draft.rewardPointsReturnFrom} onChange={(event) => onChange('rewardPointsReturnFrom', event.target.value)} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
          <Field label="库存总数">
            <input type="number" value={draft.stockTotal} onChange={(event) => onChange('stockTotal', event.target.value)} style={inputStyle} />
          </Field>
          <Field label="限购">
            <input type="number" value={draft.limitPerUser} onChange={(event) => onChange('limitPerUser', event.target.value)} style={inputStyle} />
          </Field>
          <Field label="排序">
            <input type="number" value={draft.sortOrder} onChange={(event) => onChange('sortOrder', event.target.value)} style={inputStyle} />
          </Field>
          <Field label="状态">
            <select value={draft.status} onChange={(event) => onChange('status', event.target.value)} style={inputStyle}>
              <option value="draft">草稿</option>
              <option value="active">上架中</option>
              <option value="archived">已归档</option>
              <option value="sold_out">已售罄</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>规格</div>
            <button type="button" onClick={onAddSku} style={miniButtonStyle}>新增规格</button>
          </div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {draft.skus.map((sku, index) => (
              <div key={`${sku.id || 'new'}-${index}`} style={{ borderRadius: '12px', border: '1px solid #e5e7eb', backgroundColor: '#f8fafc', padding: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                  <Field label="规格名">
                    <input value={sku.skuName} onChange={(event) => onSkuChange(index, 'skuName', event.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="SKU 编码">
                    <input value={sku.skuCode} onChange={(event) => onSkuChange(index, 'skuCode', event.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="福豆">
                    <input type="number" value={sku.pricePoints} onChange={(event) => onSkuChange(index, 'pricePoints', event.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="现金">
                    <input type="number" value={sku.priceCash} onChange={(event) => onSkuChange(index, 'priceCash', event.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="返豆">
                    <input type="number" value={sku.rewardPointsReturn} onChange={(event) => onSkuChange(index, 'rewardPointsReturn', event.target.value)} style={inputStyle} />
                  </Field>
                  <Field label="库存">
                    <input type="number" value={sku.stock} onChange={(event) => onSkuChange(index, 'stock', event.target.value)} style={inputStyle} />
                  </Field>
                  <button type="button" onClick={() => onRemoveSku(index)} style={miniButtonStyle}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
        <button type="button" onClick={onClose} style={{ ...miniButtonStyle, backgroundColor: '#fff' }}>取消</button>
        <button type="button" onClick={onSave} disabled={saving} style={{ ...miniButtonStyle, backgroundColor: '#111827', color: '#fff', borderColor: '#111827' }}>
          {saving ? '保存中...' : '保存商品'}
        </button>
      </div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#475569' }}>
    <span>{label}</span>
    {children}
  </label>
);

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '10px',
  border: '1px solid #dbe4ee',
  padding: '10px 12px',
  fontSize: '14px'
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
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid #dbe4ee',
  backgroundColor: '#fff',
  color: '#334155',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer'
};

const miniButtonStyle = {
  border: '1px solid #dbe4ee',
  borderRadius: '10px',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  backgroundColor: '#f8fafc',
  color: '#334155'
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

const FilterButton = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      border: 'none',
      borderRadius: '999px',
      padding: '10px 14px',
      backgroundColor: active ? '#111827' : '#f8fafc',
      color: active ? '#fff' : '#475569',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 600
    }}
  >
    {children}
  </button>
);

export default ShopManagement;
