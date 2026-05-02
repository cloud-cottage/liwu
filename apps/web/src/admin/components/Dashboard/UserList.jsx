import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

const SORTABLE_COLUMNS = {
  user: {
    label: '用户',
    getValue: (user) => Number(user.uid || 0)
  },
  contact: {
    label: '联系方式',
    getValue: (user) => `${user.phone || ''} ${user.email || ''}`.trim().toLowerCase()
  },
  balance: {
    label: '福豆',
    getValue: (user) => Number(user.balance || 0)
  },
  tagCount: {
    label: '标签',
    getValue: (user) => Array.isArray(user.tags) ? user.tags.length : 0
  },
  recentLoginAt: {
    label: '最近登录时间',
    getValue: (user) => getTimestampValue(user.lastActive)
  },
  earnedBadgeCount: {
    label: '已获得勋章数',
    getValue: (user) => Number(user.earnedBadgeCount || 0)
  },
  recentSevenDayPoints: {
    label: '最近七天获得福豆数',
    getValue: (user) => Number(user.recentSevenDayPoints || 0)
  },
  meditationCount: {
    label: '冥想次数',
    getValue: (user) => Number(user.meditationCount || 0)
  },
  awarenessCount: {
    label: '觉察次数',
    getValue: (user) => Number(user.awarenessCount || 0)
  },
  joinDate: {
    label: '注册时间',
    getValue: (user) => getTimestampValue(user.joinDate)
  }
};

function getTimestampValue(value) {
  const nextTimestamp = new Date(value || 0).getTime();
  return Number.isFinite(nextTimestamp) ? nextTimestamp : 0;
}

function formatDateTime(value) {
  if (!value) {
    return '未记录';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

const SortHeader = ({ label, active, direction, onClick, align = 'left' }) => (
  <th style={{ padding: '12px 8px', textAlign: align, borderBottom: '1px solid #eee' }}>
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        background: 'none',
        padding: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '14px',
        fontWeight: active ? 700 : 600,
        color: active ? '#111827' : '#64748b',
        cursor: 'pointer'
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: '11px', color: active ? '#2563eb' : '#cbd5e1' }}>
        {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
      </span>
    </button>
  </th>
);

const UserList = ({ users, onEditUser, onManageTags }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'recentLoginAt',
    direction: 'desc'
  });

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) => (
      (user.name || '').toLowerCase().includes(normalizedQuery) ||
      (user.noteName || '').toLowerCase().includes(normalizedQuery) ||
      (user.email || '').toLowerCase().includes(normalizedQuery) ||
      (user.phone || '').toLowerCase().includes(normalizedQuery) ||
      (user.id || '').toLowerCase().includes(normalizedQuery) ||
      String(user.uid || '').includes(normalizedQuery)
    ));
  }, [users, searchTerm]);

  const sortedUsers = useMemo(() => {
    const sorter = SORTABLE_COLUMNS[sortConfig.key];
    if (!sorter) {
      return filteredUsers;
    }

    const directionFactor = sortConfig.direction === 'asc' ? 1 : -1;

    return [...filteredUsers].sort((left, right) => {
      const leftValue = sorter.getValue(left);
      const rightValue = sorter.getValue(right);

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        if (leftValue === rightValue) {
          return Number(left.uid || 0) - Number(right.uid || 0);
        }
        return (leftValue - rightValue) * directionFactor;
      }

      const compared = String(leftValue).localeCompare(String(rightValue), 'zh-CN');
      if (compared === 0) {
        return Number(left.uid || 0) - Number(right.uid || 0);
      }

      return compared * directionFactor;
    });
  }, [filteredUsers, sortConfig]);

  const handleSort = (key) => {
    setSortConfig((currentConfig) => (
      currentConfig.key === key
        ? {
            key,
            direction: currentConfig.direction === 'asc' ? 'desc' : 'asc'
          }
        : {
            key,
            direction: key === 'user' || key === 'contact' ? 'asc' : 'desc'
          }
    ));
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>用户列表</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '8px 12px' }}>
          <Search size={16} color="#666" />
          <input
            type="text"
            placeholder="搜索用户..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: '14px', width: '220px' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1360px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <SortHeader label={SORTABLE_COLUMNS.user.label} active={sortConfig.key === 'user'} direction={sortConfig.direction} onClick={() => handleSort('user')} />
              <SortHeader label={SORTABLE_COLUMNS.contact.label} active={sortConfig.key === 'contact'} direction={sortConfig.direction} onClick={() => handleSort('contact')} />
              <SortHeader label={SORTABLE_COLUMNS.balance.label} active={sortConfig.key === 'balance'} direction={sortConfig.direction} onClick={() => handleSort('balance')} />
              <SortHeader label={SORTABLE_COLUMNS.tagCount.label} active={sortConfig.key === 'tagCount'} direction={sortConfig.direction} onClick={() => handleSort('tagCount')} />
              <SortHeader label={SORTABLE_COLUMNS.recentLoginAt.label} active={sortConfig.key === 'recentLoginAt'} direction={sortConfig.direction} onClick={() => handleSort('recentLoginAt')} />
              <SortHeader label={SORTABLE_COLUMNS.earnedBadgeCount.label} active={sortConfig.key === 'earnedBadgeCount'} direction={sortConfig.direction} onClick={() => handleSort('earnedBadgeCount')} />
              <SortHeader label={SORTABLE_COLUMNS.recentSevenDayPoints.label} active={sortConfig.key === 'recentSevenDayPoints'} direction={sortConfig.direction} onClick={() => handleSort('recentSevenDayPoints')} />
              <SortHeader label={SORTABLE_COLUMNS.meditationCount.label} active={sortConfig.key === 'meditationCount'} direction={sortConfig.direction} onClick={() => handleSort('meditationCount')} />
              <SortHeader label={SORTABLE_COLUMNS.awarenessCount.label} active={sortConfig.key === 'awarenessCount'} direction={sortConfig.direction} onClick={() => handleSort('awarenessCount')} />
              <SortHeader label={SORTABLE_COLUMNS.joinDate.label} active={sortConfig.key === 'joinDate'} direction={sortConfig.direction} onClick={() => handleSort('joinDate')} />
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#666', borderBottom: '1px solid #eee' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#e2e8f0',
                          color: '#334155',
                          fontSize: '12px',
                          fontWeight: 700
                        }}
                      >
                        {(user.name || '用').slice(0, 1)}
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{user.name || '未命名用户'}</div>
                        {user.isStudent && (
                          <span style={{ fontSize: '11px', color: '#0f766e', backgroundColor: '#ccfbf1', borderRadius: '999px', padding: '2px 8px' }}>
                            学员
                          </span>
                        )}
                      </div>
                      {user.noteName && (
                        <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                          备注名：{user.noteName}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: '#64748b' }}>UID：{user.uid || '未生成'}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>文档 ID：{user.id}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  <div style={{ fontSize: '13px' }}>{user.phone || '未填写手机号'}</div>
                  <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{user.email || '未填写邮箱'}</div>
                </td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>{user.balance || 0}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>当前福豆</div>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {(user.tags || []).slice(0, 2).map((tag) => (
                      <span
                        key={tag.id}
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          backgroundColor: `${tag.color || '#666'}20`,
                          color: tag.color || '#666'
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {(user.tags || []).length > 2 && (
                      <span style={{ fontSize: '12px', color: '#666' }}>+{user.tags.length - 2}</span>
                    )}
                    {(user.tags || []).length === 0 && (
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>暂无标签</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569', whiteSpace: 'nowrap' }}>
                  {formatDateTime(user.lastActive)}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#111827', fontWeight: 600 }}>
                  {user.earnedBadgeCount || 0}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#111827', fontWeight: 600 }}>
                  {user.recentSevenDayPoints || 0}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#111827', fontWeight: 600 }}>
                  {user.meditationCount || 0}
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#111827', fontWeight: 600 }}>
                  {user.awarenessCount || 0}
                </td>
                <td style={{ padding: '12px', fontSize: '13px', color: '#475569', whiteSpace: 'nowrap' }}>
                  {formatDateTime(user.joinDate)}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onEditUser(user)}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: '#2196F3',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => onManageTags(user)}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: '#FF9800',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      标签
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedUsers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          没有找到匹配 “{searchTerm}” 的用户
        </div>
      )}

      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#666' }}>
        <div>显示 {sortedUsers.length} / {users.length} 个用户</div>
      </div>
    </div>
  );
};

export default UserList;
