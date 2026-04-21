import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Coins, Layers3, MapPin, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { shopService } from '../../services/cloudbase';
import { useWealth } from '../../context/WealthContext';
import './ShopScreen.css';

const EMPTY_ADDRESS = {
  receiverName: '',
  phone: '',
  province: '',
  city: '',
  district: '',
  detailAddress: '',
  postalCode: '',
  label: '家',
  isDefault: true
};

const PRODUCT_TYPE_LABELS = {
  physical: '实物寄送',
  digital: '数字内容',
  service: '服务体验'
};

const PRODUCT_STATUS_LABELS = {
  active: '可兑换',
  draft: '待上架',
  archived: '已归档',
  sold_out: '已售罄'
};

const SHOP_TONES = [
  {
    gradient: 'linear-gradient(135deg, #f8d8b8 0%, #f0a271 100%)',
    accent: '#8f4d28',
    surface: '#fff3e4',
    shadow: 'rgba(201, 111, 39, 0.24)'
  },
  {
    gradient: 'linear-gradient(135deg, #d9e7f2 0%, #8eb6cd 100%)',
    accent: '#365e73',
    surface: '#edf6fb',
    shadow: 'rgba(54, 94, 115, 0.22)'
  },
  {
    gradient: 'linear-gradient(135deg, #e7decc 0%, #bca781 100%)',
    accent: '#695237',
    surface: '#f6f0e5',
    shadow: 'rgba(105, 82, 55, 0.2)'
  },
  {
    gradient: 'linear-gradient(135deg, #e1ecd6 0%, #92ab7e 100%)',
    accent: '#4f6742',
    surface: '#f0f6eb',
    shadow: 'rgba(79, 103, 66, 0.22)'
  }
];

const hashValue = (value = '') => (
  Array.from(String(value)).reduce((sum, char) => sum + char.charCodeAt(0), 0)
);

const getShopTone = (seed = '') => SHOP_TONES[hashValue(seed) % SHOP_TONES.length];

const formatCash = (value) => {
  if (!value) {
    return '';
  }

  return `¥${Number(value).toFixed(2)}`;
};

const formatPriceLabel = (points, cash) => (
  `${Number(points || 0)} 福豆${cash ? ` + ${formatCash(cash)}` : ''}`
);

const formatRewardReturnLabel = (value) => (
  Number(value || 0) > 0 ? `返 ${Number(value || 0)} 福豆` : '默认不返豆'
);

const getProductSynopsis = (product = {}) => (
  product.subtitle || product.description || '等待补充商品描述'
);

const getProductVisualStyle = (product = {}, tone) => (
  product.coverImage
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.08) 0%, rgba(15, 23, 42, 0.34) 100%), url("${product.coverImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }
    : {
        backgroundImage: tone.gradient
      }
);

const ProductModal = ({
  product,
  addresses,
  orderSubmitting,
  onClose,
  onSaveAddress,
  onCreateOrder
}) => {
  const fallbackProduct = product || {
    skus: [],
    productType: 'physical'
  };
  const defaultSkuId = useMemo(() => fallbackProduct.skus[0]?.id || '', [fallbackProduct.skus]);
  const defaultAddress = useMemo(
    () => addresses.find((item) => item.isDefault) || addresses[0] || EMPTY_ADDRESS,
    [addresses]
  );
  const [selectedSkuId, setSelectedSkuId] = useState(defaultSkuId);
  const [addressDraft, setAddressDraft] = useState(defaultAddress);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState('');
  const tone = useMemo(
    () => getShopTone(product?.categoryId || product?.category?.slug || product?.name || ''),
    [product?.category?.slug, product?.categoryId, product?.name]
  );

  useEffect(() => {
    setSelectedSkuId(defaultSkuId);
    setAddressDraft(defaultAddress);
    setSavingAddress(false);
    setAddressError('');
  }, [defaultAddress, defaultSkuId, product?.id]);

  if (!product) {
    return null;
  }

  const selectedSku = fallbackProduct.skus.find((item) => item.id === selectedSkuId) || fallbackProduct.skus[0] || null;

  const handleAddressChange = (field, value) => {
    setAddressDraft((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSaveAddress = async () => {
    setSavingAddress(true);
    setAddressError('');

    try {
      const nextAddress = await onSaveAddress(addressDraft);
      setAddressDraft(nextAddress);
    } catch (error) {
      setAddressError(error.message || '收货地址保存失败');
    } finally {
      setSavingAddress(false);
    }
  };

  return (
    <div className="shop-modal-backdrop" onClick={onClose}>
      <div className="shop-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose} className="shop-modal__close" aria-label="关闭商品详情">
          <X size={18} />
        </button>

        <div className="shop-modal__hero" style={getProductVisualStyle(product, tone)}>
          <div className="shop-modal__chips">
            <span className="shop-chip shop-chip--light">{product.category?.name || '工坊'}</span>
            <span className="shop-chip shop-chip--light-muted">
              {PRODUCT_STATUS_LABELS[product.status] || PRODUCT_STATUS_LABELS.active}
            </span>
          </div>
          {!product.coverImage && (
            <div className="shop-modal__monogram" style={{ color: tone.accent }}>
              {(product.name || '礼').slice(0, 1)}
            </div>
          )}
        </div>

        <div className="shop-modal__content">
          <div className="shop-modal__eyebrow">shop_item</div>
          <div className="shop-modal__title-row">
            <div>
              <h2 className="shop-modal__title">{product.name}</h2>
              <p className="shop-modal__intro">{product.description || product.subtitle || '商品详情待补充'}</p>
            </div>
            {selectedSku && (
              <div className="shop-modal__price-tag">{formatPriceLabel(selectedSku.pricePoints, selectedSku.priceCash)}</div>
            )}
          </div>

          <div className="shop-modal__metrics">
            <div className="shop-modal__metric">
              <span>销量</span>
              <strong>{product.salesCount}</strong>
            </div>
            <div className="shop-modal__metric">
              <span>库存</span>
              <strong>{product.stockTotal}</strong>
            </div>
            <div className="shop-modal__metric">
              <span>限购</span>
              <strong>{product.limitPerUser || '不限'}</strong>
            </div>
            <div className="shop-modal__metric">
              <span>返豆</span>
              <strong>{selectedSku?.rewardPointsReturn || 0}</strong>
            </div>
          </div>

          {product.skus.length > 0 && (
            <section className="shop-modal__section">
              <div className="shop-modal__section-head">
                <Layers3 size={16} />
                <span>规格选择</span>
              </div>
              <div className="shop-sku-list">
                {product.skus.map((sku) => (
                  <button
                    key={sku.id}
                    type="button"
                    onClick={() => setSelectedSkuId(sku.id)}
                    className={`shop-sku-card ${selectedSkuId === sku.id ? 'shop-sku-card--active' : ''}`}
                  >
                    <div className="shop-sku-card__title">{sku.skuName || '默认规格'}</div>
                    <div className="shop-sku-card__subtitle">
                      {formatPriceLabel(sku.pricePoints, sku.priceCash)} · {formatRewardReturnLabel(sku.rewardPointsReturn)} · 库存 {sku.stock}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {product.productType === 'physical' && (
            <section className="shop-modal__section">
              <div className="shop-modal__section-head">
                <MapPin size={16} />
                <span>收货地址</span>
              </div>
              <div className="shop-address-grid">
                <input value={addressDraft.receiverName || ''} onChange={(event) => handleAddressChange('receiverName', event.target.value)} placeholder="收件人" style={inputStyle} />
                <input value={addressDraft.phone || ''} onChange={(event) => handleAddressChange('phone', event.target.value)} placeholder="手机号" style={inputStyle} />
                <input value={addressDraft.province || ''} onChange={(event) => handleAddressChange('province', event.target.value)} placeholder="省份" style={inputStyle} />
                <input value={addressDraft.city || ''} onChange={(event) => handleAddressChange('city', event.target.value)} placeholder="城市" style={inputStyle} />
                <input value={addressDraft.district || ''} onChange={(event) => handleAddressChange('district', event.target.value)} placeholder="区县" style={inputStyle} />
                <input value={addressDraft.detailAddress || ''} onChange={(event) => handleAddressChange('detailAddress', event.target.value)} placeholder="详细地址" style={inputStyle} />
                <input value={addressDraft.postalCode || ''} onChange={(event) => handleAddressChange('postalCode', event.target.value)} placeholder="邮编（可选）" style={inputStyle} />
                <input value={addressDraft.label || ''} onChange={(event) => handleAddressChange('label', event.target.value)} placeholder="标签（家/公司）" style={inputStyle} />
              </div>
              {addressError && <div className="shop-modal__feedback shop-modal__feedback--error">{addressError}</div>}
              <button
                type="button"
                onClick={handleSaveAddress}
                disabled={savingAddress}
                className="shop-modal__secondary-action"
              >
                {savingAddress ? '保存中...' : '保存收货地址'}
              </button>
            </section>
          )}

          <button
            type="button"
            onClick={() => onCreateOrder({
              productId: product.id,
              skuId: selectedSkuId,
              addressId: addressDraft.id || ''
            })}
            disabled={orderSubmitting}
            className="shop-modal__primary-action"
          >
            {orderSubmitting
              ? '提交中...'
              : `${selectedSku?.priceCash > 0 ? '立即下单' : '立即兑换'}${selectedSku ? ` · ${formatPriceLabel(selectedSku.pricePoints, selectedSku.priceCash)}` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

const ShopScreen = () => {
  const location = useLocation();
  const { balance, syncWalletFromCloud } = useWealth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [activeProduct, setActiveProduct] = useState(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadPageData = async () => {
      setLoading(true);
      try {
        const [nextCategories, nextProducts, nextAddresses] = await Promise.all([
          shopService.getCategories(),
          shopService.getProducts(),
          shopService.getUserAddresses(),
          syncWalletFromCloud({ refresh: true, allowAnonymous: true })
        ]);

        if (!cancelled) {
          setCategories(nextCategories);
          setProducts(nextProducts);
          setAddresses(nextAddresses);
          setLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setNotice({ type: 'error', text: error.message || '工坊加载失败' });
        }
      }
    };

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [syncWalletFromCloud]);

  useEffect(() => {
    if (!notice?.text) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setNotice(null);
    }, 3200);

    return () => window.clearTimeout(timerId);
  }, [notice]);

  const filteredProducts = useMemo(() => (
    selectedCategoryId
      ? products.filter((product) => product.categoryId === selectedCategoryId)
      : products
  ), [products, selectedCategoryId]);

  const selectedCategory = useMemo(
    () => categories.find((item) => item.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );
  const requestedProductId = useMemo(() => new URLSearchParams(location.search).get('product')?.trim() || '', [location.search]);

  const highlightedCategoryDescription = selectedCategory?.description
    || '从日常仪式、空间器物到心意礼物，挑一件适合此刻练习的物品。';

  const handleOpenProduct = async (productId) => {
    try {
      const detail = await shopService.getProductDetail(productId);
      if (detail) {
        setActiveProduct(detail);
        return;
      }

      setNotice({ type: 'error', text: '商品详情暂不可用' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || '商品详情加载失败' });
    }
  };

  useEffect(() => {
    if (!requestedProductId || loading) {
      return;
    }

    void handleOpenProduct(requestedProductId);
  }, [loading, requestedProductId]);

  const handleSaveAddress = async (addressDraft) => {
    const nextAddress = await shopService.saveUserAddress(addressDraft);
    setAddresses(await shopService.getUserAddresses());
    setNotice({ type: 'success', text: '收货地址已保存' });
    return nextAddress;
  };

  const handleCreateOrder = async (payload) => {
    setOrderSubmitting(true);

    try {
      const result = await shopService.createPointsOrder(payload);
      await syncWalletFromCloud({ refresh: true, allowAnonymous: true });
      setNotice({
        type: 'success',
        text: result.order.totalCash > 0
          ? `订单已创建，等待支付确认，订单号 ${result.order.orderNo}`
          : `兑换成功，订单号 ${result.order.orderNo}`
      });
      setActiveProduct(null);
    } catch (error) {
      setNotice({ type: 'error', text: error.message || '下单失败' });
    } finally {
      setOrderSubmitting(false);
    }
  };

  return (
    <div className="page-container shop-page">
      <section className="shop-hero-card">
        <div className="shop-hero-card__top">
          <div>
            <div className="shop-hero-card__label">LIWU SHOP</div>
            <h1 className="shop-hero-card__title">工坊</h1>
            <p className="shop-hero-card__subtitle">用福豆兑换适合静心、阅读与日常安住的小器物。</p>
          </div>
          <div className="shop-balance-card">
            <div className="shop-balance-card__label">
              <Coins size={16} />
              <span>当前福豆</span>
            </div>
            <div className="shop-balance-card__value">{balance}</div>
          </div>
        </div>

        <div className="shop-hero-card__stats">
          <div className="shop-stat-chip">
            <span>当前商品</span>
            <strong>{products.length}</strong>
          </div>
          <div className="shop-stat-chip">
            <span>精选分类</span>
            <strong>{categories.length}</strong>
          </div>
          <div className="shop-stat-chip">
            <span>当前视图</span>
            <strong>{selectedCategory?.name || '全部'}</strong>
          </div>
        </div>
      </section>

      {notice?.text && (
        <div className={`shop-notice ${notice.type === 'error' ? 'shop-notice--error' : ''}`}>
          {notice.text}
        </div>
      )}

      <section className="shop-category-card">
        <div className="shop-section-head">
          <div>
            <div className="shop-section-head__kicker">{selectedCategory?.name || '全部陈列'}</div>
            <h2 className="shop-section-head__title">按分类浏览</h2>
          </div>
          <div className="shop-section-head__count">{filteredProducts.length} 件</div>
        </div>
        <p className="shop-category-card__description">{highlightedCategoryDescription}</p>
        <div className="shop-category-pill-list">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('')}
            className={`shop-category-pill ${selectedCategoryId ? '' : 'shop-category-pill--active'}`}
          >
            全部
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategoryId(category.id)}
              className={`shop-category-pill ${selectedCategoryId === category.id ? 'shop-category-pill--active' : ''}`}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      <section className="shop-gallery-section">
        <div className="shop-section-head">
          <div>
            <div className="shop-section-head__kicker">礼物陈列</div>
            <h2 className="shop-section-head__title">可兑换清单</h2>
          </div>
          <div className="shop-gallery-section__hint">
            <Sparkles size={16} />
            <span>点击查看详情</span>
          </div>
        </div>

        {loading ? (
          <div className="shop-empty-card">正在加载工坊数据...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="shop-empty-card">当前分类下还没有商品。</div>
        ) : (
          <div className="shop-product-list">
            {filteredProducts.map((product) => {
              const category = categories.find((item) => item.id === product.categoryId) || null;
              const tone = getShopTone(product.categoryId || product.name);

              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleOpenProduct(product.id)}
                  className="shop-product-card"
                >
                  <div className="shop-product-card__visual" style={getProductVisualStyle(product, tone)}>
                    <div className="shop-product-card__badges">
                      <span className="shop-chip shop-chip--light">{category?.name || '工坊'}</span>
                      <span className="shop-chip shop-chip--light-muted">
                        {product.limitPerUser ? `限兑 ${product.limitPerUser}` : PRODUCT_TYPE_LABELS[product.productType] || '福豆兑换'}
                      </span>
                    </div>
                    {!product.coverImage && (
                      <div className="shop-product-card__monogram" style={{ color: tone.accent }}>
                        {(product.name || '礼').slice(0, 1)}
                      </div>
                    )}
                    <div className="shop-product-card__visual-shadow" style={{ background: tone.surface, boxShadow: `0 24px 40px ${tone.shadow}` }} />
                  </div>

                  <div className="shop-product-card__body">
                    <div className="shop-product-card__header">
                      <div>
                        <div className="shop-product-card__title">{product.name}</div>
                        <div className="shop-product-card__subtitle">{getProductSynopsis(product)}</div>
                      </div>
                      <div className="shop-product-card__link">
                        <ArrowUpRight size={18} />
                      </div>
                    </div>

                    <div className="shop-product-card__meta">
                      <span>库存 {product.stockTotal}</span>
                      <span>已兑 {product.salesCount}</span>
                      <span>{formatRewardReturnLabel(product.rewardPointsReturnFrom)}</span>
                      <span>{PRODUCT_STATUS_LABELS[product.status] || PRODUCT_STATUS_LABELS.active}</span>
                    </div>

                    <div className="shop-product-card__footer">
                      <div className="shop-product-card__price">
                        {formatPriceLabel(product.pricePointsFrom, product.priceCashFrom)}
                      </div>
                      <div className="shop-product-card__action">查看详情</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <ProductModal
        product={activeProduct}
        addresses={addresses}
        orderSubmitting={orderSubmitting}
        onClose={() => setActiveProduct(null)}
        onSaveAddress={handleSaveAddress}
        onCreateOrder={handleCreateOrder}
      />
    </div>
  );
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  padding: '12px 14px',
  fontSize: '14px'
};

export default ShopScreen;
