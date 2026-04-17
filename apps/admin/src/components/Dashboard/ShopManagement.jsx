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

const ShopManagement = ({
  categories,
  products,
  skus,
  orders,
  orderItems
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

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
          这里集中查看工坊分类、商品、规格和订单数据，先做运营只读视图。
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
        <h3 style={{ margin: '0 0 16px', fontSize: '20px', color: '#111827' }}>商品与分类</h3>
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
    </div>
  );
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
