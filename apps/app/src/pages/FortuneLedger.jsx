import React from 'react';
import { ArrowLeft, Coins, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FortuneBeanIcon from '../components/Icons/FortuneBeanIcon.jsx';
import { useWealth } from '../context/WealthContext';

const FortuneLedger = () => {
  const navigate = useNavigate();
  const { balance, history } = useWealth();

  return (
    <div className="page-container" style={{ padding: '20px', paddingBottom: '96px' }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        style={{
          border: 'none',
          background: 'none',
          color: 'var(--color-text-secondary)',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        <ArrowLeft size={18} />
        返回
      </button>

      <section
        style={{
          backgroundColor: '#fff',
          borderRadius: '20px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--color-accent-clay)' }}>
          <Coins size={18} />
          <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            fortune_ledger
          </span>
        </div>
        <h1 style={{ fontSize: '28px', margin: '12px 0 0' }}>福豆记录</h1>
        <p style={{ margin: '10px 0 0', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
          查看每一笔福豆的获得与支出，保持自己的练习轨迹清晰可见。
        </p>

        <div
          style={{
            marginTop: '18px',
            padding: '18px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, rgba(214, 140, 101, 0.12) 0%, rgba(214, 140, 101, 0.2) 100%)'
          }}
        >
          <div style={{ fontSize: '13px', color: '#9a3412', fontWeight: 600 }}>当前福豆</div>
          <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '36px', fontWeight: 700, color: '#7c2d12' }}>
            <span>{balance}</span>
            <FortuneBeanIcon size={28} style={{ color: '#9a3412' }} aria-label="福豆" />
          </div>
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Coins size={16} color="var(--color-accent-ink)" />
          <h2 style={{ margin: 0, fontSize: '17px' }}>全部记录</h2>
        </div>

        {history.length === 0 ? (
          <div
            style={{
              backgroundColor: '#fff',
              padding: '22px',
              borderRadius: '16px',
              boxShadow: 'var(--shadow-sm)',
              color: 'var(--color-text-secondary)',
              textAlign: 'center'
            }}
          >
            暂无福豆记录
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {history.map((item) => {
              const isEarn = item.type === 'EARN';
              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    padding: '16px 18px',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '14px',
                        backgroundColor: isEarn ? 'rgba(107, 142, 35, 0.14)' : 'rgba(44, 44, 44, 0.08)',
                        color: isEarn ? 'var(--color-success)' : 'var(--color-accent-ink)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      {isEarn ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {item.description || '福豆变动'}
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {new Date(item.date).toLocaleString('zh-CN', { hour12: false })}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: '16px',
                      fontWeight: 700,
                      color: isEarn ? 'var(--color-success)' : 'var(--color-accent-ink)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <span>{isEarn ? '+' : '-'}{Math.abs(Number(item.amount || 0))}</span>
                    <FortuneBeanIcon size={16} style={{ color: 'currentColor' }} aria-label="福豆" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default FortuneLedger;
