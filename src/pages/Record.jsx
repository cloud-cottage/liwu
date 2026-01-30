import React, { useState } from 'react';
import { useWealth } from '../context/WealthContext';
import { Sparkles, TrendingUp } from 'lucide-react';

const Record = () => {
    const {
        awarenessRecords,
        addAwarenessRecord,
        getUserTags,
        getPopularTags
    } = useWealth();

    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState('');

    const userTags = getUserTags();
    const popularTags = getPopularTags();

    const handleSubmit = (e) => {
        e.preventDefault();
        const trimmed = inputValue.trim();

        // Validation: 1-6 characters
        if (trimmed.length === 0) {
            setError('请输入标签内容');
            return;
        }
        if (trimmed.length > 6) {
            setError('标签长度不能超过6个字符');
            return;
        }

        addAwarenessRecord(trimmed);
        setInputValue('');
        setError('');
    };

    const handleTagClick = (tagContent) => {
        addAwarenessRecord(tagContent);
    };

    return (
        <div style={{
            padding: '20px',
            paddingBottom: '100px',
            minHeight: '100vh',
            backgroundColor: 'var(--color-bg-primary)'
        }}>
            {/* Header */}
            <h1 style={{
                fontSize: '28px',
                marginBottom: '8px',
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-text-primary)'
            }}>
                觉察
            </h1>
            <p style={{
                fontSize: '14px',
                color: 'var(--color-text-secondary)',
                marginBottom: '32px'
            }}>
                觉察你此刻的状态
            </p>

            {/* Input Section */}
            <div style={{
                backgroundColor: '#fff',
                padding: '24px',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-sm)',
                marginBottom: '32px'
            }}>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setError('');
                            }}
                            placeholder="输入你的状态 (1-6个字符)"
                            maxLength={6}
                            style={{
                                width: '100%',
                                padding: '14px',
                                border: error ? '2px solid #f56565' : '1px solid var(--color-border)',
                                borderRadius: '12px',
                                fontSize: '16px',
                                boxSizing: 'border-box',
                                fontFamily: 'var(--font-sans)',
                                outline: 'none',
                                transition: 'border-color 0.2s'
                            }}
                        />
                        {error && (
                            <div style={{
                                color: '#f56565',
                                fontSize: '12px',
                                marginTop: '8px'
                            }}>
                                {error}
                            </div>
                        )}
                        <div style={{
                            fontSize: '12px',
                            color: 'var(--color-text-secondary)',
                            marginTop: '8px',
                            textAlign: 'right'
                        }}>
                            {inputValue.length}/6
                        </div>
                    </div>
                    <button
                        type="submit"
                        style={{
                            width: '100%',
                            padding: '14px',
                            backgroundColor: 'var(--color-accent-ink)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: '500',
                            fontSize: '16px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                        <Sparkles size={18} />
                        觉察此刻
                    </button>
                </form>
            </div>

            {/* User's Tags Section */}
            {userTags.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                    <h2 style={{
                        fontSize: '18px',
                        marginBottom: '16px',
                        fontWeight: '600',
                        color: 'var(--color-text-primary)'
                    }}>
                        我的觉察
                    </h2>
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        {userTags.map((tag, index) => (
                            <button
                                key={index}
                                onClick={() => handleTagClick(tag.content)}
                                style={{
                                    padding: '10px 16px',
                                    backgroundColor: '#fff',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s',
                                    boxShadow: 'var(--shadow-sm)'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.backgroundColor = 'var(--color-bg-secondary)';
                                    e.target.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.backgroundColor = '#fff';
                                    e.target.style.transform = 'translateY(0)';
                                }}
                            >
                                <span style={{
                                    fontSize: '14px',
                                    fontWeight: '500'
                                }}>
                                    {tag.content}
                                </span>
                                <span style={{
                                    fontSize: '12px',
                                    color: 'var(--color-text-secondary)',
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    padding: '2px 8px',
                                    borderRadius: '10px'
                                }}>
                                    {tag.count}次
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Popular Tags Section */}
            {popularTags.length > 0 && (
                <div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '16px'
                    }}>
                        <TrendingUp size={18} color="var(--color-accent-clay)" />
                        <h2 style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            color: 'var(--color-text-primary)',
                            margin: 0
                        }}>
                            社区热门
                        </h2>
                    </div>
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        {popularTags.map((tag, index) => (
                            <button
                                key={index}
                                onClick={() => handleTagClick(tag.content)}
                                style={{
                                    padding: '10px 16px',
                                    backgroundColor: 'rgba(246, 146, 121, 0.1)',
                                    border: '1px solid rgba(246, 146, 121, 0.3)',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.target.style.backgroundColor = 'rgba(246, 146, 121, 0.2)';
                                    e.target.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.target.style.backgroundColor = 'rgba(246, 146, 121, 0.1)';
                                    e.target.style.transform = 'translateY(0)';
                                }}
                            >
                                <span style={{
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    color: 'var(--color-accent-clay)'
                                }}>
                                    {tag.content}
                                </span>
                                <span style={{
                                    fontSize: '12px',
                                    color: 'var(--color-accent-clay)',
                                    opacity: 0.7
                                }}>
                                    {tag.totalCount}次
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {userTags.length === 0 && popularTags.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'var(--color-text-secondary)'
                }}>
                    <Sparkles size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p>开始觉察你的第一个状态吧</p>
                </div>
            )}
        </div>
    );
};

export default Record;
