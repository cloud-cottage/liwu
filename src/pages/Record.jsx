import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWealth } from '../context/WealthContext';
import { Trash2, Plus, ShoppingBag, Users } from 'lucide-react';

const Record = () => {
    const navigate = useNavigate();
    const { addWealth, dreams, addDream, buyDream, inventory } = useWealth();
    const [itemName, setItemName] = useState('');
    const [itemValue, setItemValue] = useState('');
    const [dreamName, setDreamName] = useState('');
    const [dreamPrice, setDreamPrice] = useState('');
    const [showAddDream, setShowAddDream] = useState(false);

    const handleDeclutter = (e) => {
        e.preventDefault();
        if (!itemName || !itemValue) return;
        const value = parseInt(itemValue, 10);
        if (isNaN(value) || value <= 0) return;

        addWealth(value, `断舍离：${itemName}`);
        setItemName('');
        setItemValue('');
        alert(`已断舍离 "${itemName}"，获得 ¥${value} 虚拟金钱！`);
    };

    const handleAddDream = (e) => {
        e.preventDefault();
        if (!dreamName || !dreamPrice) return;
        const price = parseInt(dreamPrice, 10);
        if (isNaN(price) || price <= 0) return;

        addDream(dreamName, price);
        setDreamName('');
        setDreamPrice('');
        setShowAddDream(false);
    };

    return (
        <div style={{ padding: '20px', paddingBottom: '80px' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '20px', fontFamily: 'var(--font-serif)' }}>记录与梦想</h1>

            {/* Community Entrance */}
            <div
                onClick={() => navigate('/community')}
                style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    padding: '16px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '30px',
                    cursor: 'pointer'
                }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px',
                    color: 'var(--color-accent-clay)'
                }}>
                    <Users size={20} />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '500', fontSize: '14px' }}>社区动态</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>看看大家都在断舍离什么</div>
                </div>
                <div style={{ color: 'var(--color-text-secondary)' }}>→</div>
            </div>

            {/* Declutter Section */}
            <section style={{ marginBottom: '40px' }}>
                <h2 style={{ fontSize: '18px', marginBottom: '15px', display: 'flex', alignItems: 'center' }}>
                    <Trash2 size={20} style={{ marginRight: '8px' }} />
                    断舍离
                </h2>
                <div style={{
                    backgroundColor: '#fff',
                    padding: '24px',
                    borderRadius: '16px',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px', fontSize: '14px' }}>
                        每一次告别，都是为了更好的相遇。
                    </p>
                    <form onSubmit={handleDeclutter}>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: '500' }}>物品名称</label>
                            <input
                                type="text"
                                value={itemName}
                                onChange={(e) => setItemName(e.target.value)}
                                placeholder="例如：旧蓝牙音箱"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: '500' }}>估值 (¥)</label>
                            <input
                                type="number"
                                value={itemValue}
                                onChange={(e) => setItemValue(e.target.value)}
                                placeholder="例如：200"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '8px',
                                    fontSize: '14px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                        <button type="submit" style={{
                            width: '100%',
                            padding: '14px',
                            backgroundColor: 'var(--color-accent-ink)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: '500',
                            cursor: 'pointer'
                        }}>
                            提交并礼敬
                        </button>
                    </form>
                </div>
            </section>

            {/* Dream List Section */}
            <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h2 style={{ fontSize: '18px', display: 'flex', alignItems: 'center', margin: 0 }}>
                        <ShoppingBag size={20} style={{ marginRight: '8px' }} />
                        我的梦想清单
                    </h2>
                    <button
                        onClick={() => setShowAddDream(!showAddDream)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-accent-clay)',
                            fontWeight: '500',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <Plus size={16} style={{ marginRight: '4px' }} />
                        添加梦想
                    </button>
                </div>

                {showAddDream && (
                    <div style={{
                        backgroundColor: '#fff',
                        padding: '20px',
                        borderRadius: '16px',
                        boxShadow: 'var(--shadow-sm)',
                        marginBottom: '20px',
                        animation: 'fadeIn 0.3s ease'
                    }}>
                        <form onSubmit={handleAddDream}>
                            <div style={{ marginBottom: '12px' }}>
                                <input
                                    type="text"
                                    value={dreamName}
                                    onChange={(e) => setDreamName(e.target.value)}
                                    placeholder="梦想物品名称"
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <input
                                    type="number"
                                    value={dreamPrice}
                                    onChange={(e) => setDreamPrice(e.target.value)}
                                    placeholder="目标价格 (¥)"
                                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', boxSizing: 'border-box' }}
                                />
                            </div>
                            <button type="submit" style={{
                                width: '100%', padding: '10px', backgroundColor: 'var(--color-accent-clay)', color: '#fff', border: 'none', borderRadius: '8px'
                            }}>确定添加</button>
                        </form>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {dreams.length === 0 ? (
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '20px',
                            borderRadius: '12px',
                            textAlign: 'center',
                            color: 'var(--color-text-secondary)',
                            fontSize: '14px'
                        }}>
                            暂无梦想，去添加一个吧
                        </div>
                    ) : (
                        dreams.map((dream) => (
                            <div key={dream.id} style={{
                                backgroundColor: '#fff',
                                padding: '16px',
                                borderRadius: '12px',
                                boxShadow: 'var(--shadow-sm)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                opacity: dream.acquired ? 0.6 : 1
                            }}>
                                <div>
                                    <div style={{ fontWeight: '500', marginBottom: '4px', textDecoration: dream.acquired ? 'line-through' : 'none' }}>{dream.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                        {dream.acquired ? '已实现' : `目标: ¥${dream.price}`}
                                    </div>
                                </div>
                                {!dream.acquired && (
                                    <button
                                        onClick={() => buyDream(dream.id)}
                                        style={{
                                            padding: '6px 12px',
                                            backgroundColor: 'var(--color-bg-secondary)',
                                            color: 'var(--color-accent-ink)',
                                            border: 'none',
                                            borderRadius: '6px',
                                            fontSize: '12px',
                                            fontWeight: '500',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        购买
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
};

export default Record;
