import React from 'react';

const MOCK_FEED = [
    { id: 1, type: 'DECLUTTER', user: '匿名用户', content: '断舍离了闲置的烤箱', value: 300, time: '10分钟前' },
    { id: 2, type: 'MEDITATION', user: 'A***', content: '完成了今日冥想，内心平静。', time: '25分钟前' },
    { id: 3, type: 'DECLUTTER', user: '匿名用户', content: '捐赠了一箱旧书', value: 150, time: '1小时前' },
    { id: 4, type: 'DREAM', user: 'L***', content: '终于兑换了心仪已久的降噪耳机！', time: '2小时前' },
];

const Community = () => {
    return (
        <div style={{ padding: '20px', paddingBottom: '80px' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '20px', fontFamily: 'var(--font-serif)' }}>社区动态</h1>

            {MOCK_FEED.map((item) => (
                <div key={item.id} style={{
                    backgroundColor: '#fff',
                    padding: '16px',
                    borderRadius: '12px',
                    marginBottom: '16px',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontWeight: '500', fontSize: '14px' }}>{item.user}</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.time}</span>
                    </div>
                    <p style={{ marginBottom: '8px', fontSize: '14px', lineHeight: '1.5' }}>
                        {item.content}
                    </p>
                    {item.value && (
                        <div style={{ fontSize: '12px', color: 'var(--color-accent-clay)', fontWeight: '500' }}>
                            + 价值 ¥ {item.value}
                        </div>
                    )}
                </div>
            ))}

            <div style={{ textAlign: 'center', marginTop: '30px', color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                更多动态加载中...
            </div>
        </div>
    );
};

export default Community;
