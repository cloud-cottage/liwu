import React from 'react';
import { Settings, Award, Wallet } from 'lucide-react';
import { useWealth } from '../context/WealthContext';

const Profile = () => {
    const { balance, inventory, history } = useWealth();

    // Simple honor points calculation (mock logic)
    // 10 points per item decluttered, 50 points per dream achieved (inventory count)
    const declutteredCount = history.filter(h => h.type === 'EARN').length;
    const dreamCount = inventory.length;
    const honorPoints = (declutteredCount * 10) + (dreamCount * 50);

    return (
        <div style={{ padding: '20px', paddingBottom: '80px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                {/* Settings placeholder */}
                <Settings size={20} color="var(--color-text-secondary)" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-bg-secondary)',
                    marginRight: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px'
                }}>
                    🧘
                </div>
                <div>
                    <h2 style={{ fontSize: '20px', marginBottom: '4px', fontFamily: 'var(--font-serif)' }}>每一天</h2>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        已断舍离 {declutteredCount} 件物品
                    </p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '30px' }}>
                <div style={{
                    backgroundColor: '#fff',
                    padding: '16px',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', color: 'var(--color-accent-clay)' }}>
                        <Wallet size={18} style={{ marginRight: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: '500' }}>虚拟资产</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>¥ {balance}</div>
                </div>

                <div style={{
                    backgroundColor: '#fff',
                    padding: '16px',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                        <Award size={18} style={{ marginRight: '8px' }} />
                        <span style={{ fontSize: '12px', fontWeight: '500' }}>福豆</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{honorPoints}</div>
                </div>
            </div>

            <section>
                <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>迎来送往 (最近觉察)</h3>
                {history.length === 0 ? (
                    <div style={{
                        backgroundColor: '#fff',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: 'var(--shadow-sm)',
                        textAlign: 'center',
                        color: 'var(--color-text-secondary)',
                        fontSize: '14px'
                    }}>
                        暂无觉察
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {history.slice(0, 5).map(item => (
                            <div key={item.id} style={{
                                backgroundColor: '#fff',
                                padding: '12px 16px',
                                borderRadius: '8px',
                                boxShadow: 'var(--shadow-sm)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontSize: '14px' }}>{item.description}</div>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    color: item.type === 'EARN' ? 'var(--color-success)' : 'var(--color-accent-ink)'
                                }}>
                                    {item.type === 'EARN' ? '+' : ''} {item.amount}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default Profile;
