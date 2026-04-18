import React, { useMemo, useState } from 'react';

const formatCash = (value) => (value ? `¥${Number(value).toFixed(2)}` : '纯福豆');

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
  stock: 0,
  status: 'active'
});

const createProductDraft = (product = null, skus = []) => ({
  id: product?.id || '',
  name: product?.name || '',
  subtitle: product?.subtitle || '',
  categoryId: product?.categoryId || '',
  productType: product?.productType || 'physical',
  description: product?.description || '',
  status: product?.status || 'draft',
  skuMode: product?.skuMode || 'single',
  pricePointsFrom: product?.pricePointsFrom || 0,
  priceCashFrom: product?.priceCashFrom || 0,
  stockTotal: product?.stockTotal || 0,
  salesCount: product?.salesCount || 0,
  limitPerUser: product?.limitPerUser || 0,
  sortOrder: product?.sortOrder || 0,
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
    setEditingProduct(null);
    setProductDraft(createProductDraft());
  };

  const handleProductDraftChange = (field, value) => {
    setProductDraft((currentDraft) => ({
      ...currentDraft,
      [field]: ['pricePointsFrom', 'priceCashFrom', 'stockTotal', 'salesCount', 'limitPerUser', 'sortOrder'].includes(field)
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
              [field]: ['pricePoints', 'priceCash', 'stock'].includes(field) ? Number(value || 0) : value
            }
          : sku
      ))
    }));
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

  const handleSaveProduct = async () => {
    setSavingProduct(true);
    await onSaveProduct(productDraft);
    setSavingProduct(false);
    setEditingProduct(null);
    setProductDraft(createProductDraft());
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
                          {sku.pricePoints} 福豆 · {formatCash(sku.priceCash)} · 库存 {sku.stock}
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
                        {item.skuName || '默认规格'} · x{item.quantity} · {item.subtotalPoints} 福豆
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
          <Field label="福豆起价">
            <input type="number" value={draft.pricePointsFrom} onChange={(event) => onChange('pricePointsFrom', event.target.value)} style={inputStyle} />
          </Field>
          <Field label="现金起价">
            <input type="number" value={draft.priceCashFrom} onChange={(event) => onChange('priceCashFrom', event.target.value)} style={inputStyle} />
          </Field>
          <Field label="库存总数">
            <input type="number" value={draft.stockTotal} onChange={(event) => onChange('stockTotal', event.target.value)} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
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
