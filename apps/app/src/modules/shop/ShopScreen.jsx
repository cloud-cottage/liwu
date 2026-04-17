import React, { useEffect, useMemo, useState } from 'react';
import { Coins, MapPin, Package, X } from 'lucide-react';
import { shopService } from '../../services/cloudbase';
import { useWealth } from '../../context/WealthContext';

const formatCash = (value) => {
  if (!value) {
    return '';
  }

  return `¥${Number(value).toFixed(2)}`;
};

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
  const defaultSkuId = fallbackProduct.skus[0]?.id || '';
  const defaultAddress = addresses.find((item) => item.isDefault) || addresses[0] || {
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
  const [selectedSkuId, setSelectedSkuId] = useState(defaultSkuId);
  const [addressDraft, setAddressDraft] = useState(defaultAddress);
  const [savingAddress, setSavingAddress] = useState(false);

  if (!product) {
    return null;
  }

  const handleAddressChange = (field, value) => {
    setAddressDraft((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handleSaveAddress = async () => {
    setSavingAddress(true);
    const nextAddress = await onSaveAddress(addressDraft);
    setAddressDraft(nextAddress);
    setSavingAddress(false);
  };

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
        zIndex: 40
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: '0 24px 80px rgba(15, 23, 42, 0.2)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              shop_item
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>{product.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.7, marginBottom: '16px' }}>
          {product.description || product.subtitle || '商品详情待补充'}
        </div>

        <div style={{ display: 'grid', gap: '10px', marginBottom: '18px' }}>
          <div style={{ fontSize: '13px', color: '#475569' }}>分类：{product.category?.name || '未分类'}</div>
          <div style={{ fontSize: '13px', color: '#475569' }}>销量：{product.salesCount}</div>
          <div style={{ fontSize: '13px', color: '#475569' }}>库存：{product.stockTotal}</div>
          <div style={{ fontSize: '13px', color: '#475569' }}>限购：{product.limitPerUser || '不限'}</div>
        </div>

        {product.skus.length > 0 && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>规格</div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {product.skus.map((sku) => (
                <button
                  key={sku.id}
                  type="button"
                  onClick={() => setSelectedSkuId(sku.id)}
                  style={{
                    borderRadius: '14px',
                    border: selectedSkuId === sku.id ? '1px solid #111827' : '1px solid #e2e8f0',
                    padding: '14px 16px',
                    backgroundColor: selectedSkuId === sku.id ? '#f1f5f9' : '#f8fafc',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{sku.skuName || '默认规格'}</div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                    {sku.pricePoints} 福豆{sku.priceCash ? ` + ${formatCash(sku.priceCash)}` : ''} · 库存 {sku.stock}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {product.productType === 'physical' && (
          <div style={{ marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#0f172a' }}>
              <MapPin size={16} />
              <span style={{ fontSize: '14px', fontWeight: 700 }}>收货地址</span>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input value={addressDraft.receiverName || ''} onChange={(event) => handleAddressChange('receiverName', event.target.value)} placeholder="收件人" style={inputStyle} />
              <input value={addressDraft.phone || ''} onChange={(event) => handleAddressChange('phone', event.target.value)} placeholder="手机号" style={inputStyle} />
              <input value={addressDraft.province || ''} onChange={(event) => handleAddressChange('province', event.target.value)} placeholder="省份" style={inputStyle} />
              <input value={addressDraft.city || ''} onChange={(event) => handleAddressChange('city', event.target.value)} placeholder="城市" style={inputStyle} />
              <input value={addressDraft.district || ''} onChange={(event) => handleAddressChange('district', event.target.value)} placeholder="区县" style={inputStyle} />
              <input value={addressDraft.detailAddress || ''} onChange={(event) => handleAddressChange('detailAddress', event.target.value)} placeholder="详细地址" style={inputStyle} />
              <input value={addressDraft.postalCode || ''} onChange={(event) => handleAddressChange('postalCode', event.target.value)} placeholder="邮编（可选）" style={inputStyle} />
              <input value={addressDraft.label || ''} onChange={(event) => handleAddressChange('label', event.target.value)} placeholder="标签（家/公司）" style={inputStyle} />
            </div>
            <button
              type="button"
              onClick={handleSaveAddress}
              disabled={savingAddress}
              style={{
                width: '100%',
                marginTop: '12px',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                backgroundColor: '#fff',
                color: '#334155',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: savingAddress ? 'default' : 'pointer'
              }}
            >
              {savingAddress ? '保存中...' : '保存收货地址'}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => onCreateOrder({
            productId: product.id,
            skuId: selectedSkuId,
            addressId: addressDraft.id || ''
          })}
          disabled={orderSubmitting}
          style={{
            width: '100%',
            border: 'none',
            borderRadius: '12px',
            backgroundColor: orderSubmitting ? '#cbd5e1' : '#111827',
            color: '#fff',
            padding: '12px 16px',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          {orderSubmitting ? '提交中...' : '立即兑换'}
        </button>
      </div>
    </div>
  );
};

const ShopScreen = () => {
  const { balance } = useWealth();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [activeProduct, setActiveProduct] = useState(null);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadPageData = async () => {
      setLoading(true);
      const [nextCategories, nextProducts, nextAddresses] = await Promise.all([
        shopService.getCategories(),
        shopService.getProducts(),
        shopService.getUserAddresses()
      ]);

      if (!cancelled) {
        setCategories(nextCategories);
        setProducts(nextProducts);
        setAddresses(nextAddresses);
        setLoading(false);
      }
    };

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => (
    selectedCategoryId
      ? products.filter((product) => product.categoryId === selectedCategoryId)
      : products
  ), [products, selectedCategoryId]);

  const handleOpenProduct = async (productId) => {
    const detail = await shopService.getProductDetail(productId);
    if (detail) {
      setActiveProduct(detail);
    }
  };

  const handleSaveAddress = async (addressDraft) => {
    const nextAddress = await shopService.saveUserAddress(addressDraft);
    setAddresses(await shopService.getUserAddresses());
    setNotice('收货地址已保存');
    return nextAddress;
  };

  const handleCreateOrder = async (payload) => {
    setOrderSubmitting(true);
    try {
      const result = await shopService.createPointsOrder(payload);
      setNotice(`兑换成功，订单号 ${result.order.orderNo}`);
      setActiveProduct(null);
    } catch (error) {
      setNotice(error.message || '兑换失败');
    } finally {
      setOrderSubmitting(false);
    }
  };

  return (
    <div className="page-container" style={{ padding: '20px', paddingBottom: '90px' }}>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>工坊</h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>
          线上店铺第一版已接入分类、商品和规格读取。
        </p>
      </header>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent-clay)', marginBottom: '8px' }}>
          <Coins size={18} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>当前福豆</span>
        </div>
        <div style={{ fontSize: '28px', fontWeight: 700 }}>{balance}</div>
      </section>

      {notice && (
        <div
          style={{
            marginBottom: '20px',
            borderRadius: '12px',
            backgroundColor: '#eff6ff',
            color: '#1d4ed8',
            padding: '12px 14px',
            fontSize: '13px'
          }}
        >
          {notice}
        </div>
      )}

      <section style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedCategoryId('')}
            style={{
              border: 'none',
              borderRadius: '999px',
              padding: '10px 14px',
              backgroundColor: selectedCategoryId ? '#fff' : '#111827',
              color: selectedCategoryId ? '#475569' : '#fff',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer'
            }}
          >
            全部
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategoryId(category.id)}
              style={{
                border: 'none',
                borderRadius: '999px',
                padding: '10px 14px',
                backgroundColor: selectedCategoryId === category.id ? '#111827' : '#fff',
                color: selectedCategoryId === category.id ? '#fff' : '#475569',
                boxShadow: 'var(--shadow-sm)',
                cursor: 'pointer'
              }}
            >
              {category.name}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div style={{ color: 'var(--color-text-secondary)' }}>正在加载工坊数据...</div>
      ) : filteredProducts.length === 0 ? (
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--color-text-secondary)'
          }}
        >
          当前分类下还没有商品。
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => handleOpenProduct(product.id)}
              style={{
                border: 'none',
                borderRadius: '18px',
                padding: '20px',
                backgroundColor: '#fff',
                boxShadow: 'var(--shadow-sm)',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>{product.name}</div>
                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b', lineHeight: 1.7 }}>
                    {product.subtitle || product.description || '等待补充商品描述'}
                  </div>
                </div>
                <div style={{ color: '#cbd5e1' }}>
                  <Package size={20} />
                </div>
              </div>
              <div style={{ marginTop: '14px', fontSize: '13px', color: '#0f172a', fontWeight: 600 }}>
                {product.pricePointsFrom} 福豆{product.priceCashFrom ? ` + ${formatCash(product.priceCashFrom)}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}

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
  borderRadius: '12px',
  border: '1px solid #dbe4ee',
  padding: '12px 14px',
  fontSize: '14px'
};

export default ShopScreen
