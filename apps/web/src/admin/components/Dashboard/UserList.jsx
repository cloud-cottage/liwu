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

const ADMIN_PHONE = '16601061656';
const BRAND_LEAD_ROLE_TAG_NAME = '品牌方主理人';
const BRAND_MEMBER_ROLE_TAG_NAME = '品牌方';

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '').slice(-11);

const hasRoleTag = (user, labels = []) => {
  const normalizedLabels = labels.map((label) => String(label || '').trim());
  return (user.tags || []).some((tag) => normalizedLabels.includes(String(tag.name || tag.label || '').trim()));
};

const getRoleLabels = (user) => {
  const labels = [];
  if (normalizePhone(user.phone || '') === ADMIN_PHONE || hasRoleTag(user, ['超级管理员'])) {
    labels.push('超级管理员');
  }
  if (hasRoleTag(user, ['管理员'])) {
    labels.push('管理员');
  }
  if (hasRoleTag(user, ['代理商'])) {
    labels.push('代理商');
  }
  if (hasRoleTag(user, [BRAND_LEAD_ROLE_TAG_NAME])) {
    labels.push(BRAND_LEAD_ROLE_TAG_NAME);
  }
  if (hasRoleTag(user, [BRAND_MEMBER_ROLE_TAG_NAME])) {
    labels.push(BRAND_MEMBER_ROLE_TAG_NAME);
  }

  return labels;
};

const getInlineTags = (user) => {
  const roleLabels = getRoleLabels(user);
  const nextTags = [];

  if (user.isStudent) {
    nextTags.push({
      key: '学员',
      label: '学员',
      backgroundColor: '#ccfbf1',
      color: '#0f766e'
    });
  }

  roleLabels.forEach((roleLabel) => {
    nextTags.push({
      key: roleLabel,
      label: roleLabel,
      backgroundColor:
        roleLabel === '超级管理员' ? '#ffedd5' :
        roleLabel === '管理员' ? '#ede9fe' :
        roleLabel === '代理商' ? '#ccfbf1' : '#dbeafe',
      color:
        roleLabel === '超级管理员' ? '#7c2d12' :
        roleLabel === '管理员' ? '#5b21b6' :
        roleLabel === '代理商' ? '#0f766e' : '#1d4ed8'
    });
  });

  (user.tags || []).forEach((tag) => {
    const tagName = String(tag.name || '').trim();
    if (!tagName || roleLabels.includes(tagName) || tagName === '学员') {
      return;
    }

    nextTags.push({
      key: `${tag.id || tagName}`,
      label: tagName,
      backgroundColor: `${tag.color || '#666'}20`,
      color: tag.color || '#666'
    });
  });

  return nextTags;
};

const UserList = ({ users, roleView = 'all', onEditUser, onManageTags }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'recentLoginAt',
    direction: 'desc'
  });

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      const normalizedPhone = normalizePhone(user.phone || '');
      const isSuperAdmin = normalizedPhone === ADMIN_PHONE;
      const matchesRole =
        roleView === 'all' ||
        (roleView === 'admin' && (isSuperAdmin || hasRoleTag(user, ['超级管理员', '管理员']))) ||
        (roleView === 'agent' && hasRoleTag(user, ['代理商'])) ||
        (roleView === 'brand' && hasRoleTag(user, [BRAND_LEAD_ROLE_TAG_NAME, BRAND_MEMBER_ROLE_TAG_NAME]));

      if (!matchesRole) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        (user.name || '').toLowerCase().includes(normalizedQuery) ||
        (user.noteName || '').toLowerCase().includes(normalizedQuery) ||
        (user.email || '').toLowerCase().includes(normalizedQuery) ||
        (user.phone || '').toLowerCase().includes(normalizedQuery) ||
        (user.id || '').toLowerCase().includes(normalizedQuery) ||
        String(user.uid || '').includes(normalizedQuery)
      );
    });
  }, [users, roleView, searchTerm]);

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

  const roleCounts = useMemo(() => ({
    all: users.length,
    admin: users.filter((user) => normalizePhone(user.phone || '') === ADMIN_PHONE || hasRoleTag(user, ['超级管理员', '管理员'])).length,
    agent: users.filter((user) => hasRoleTag(user, ['代理商'])).length,
    brand: users.filter((user) => hasRoleTag(user, [BRAND_LEAD_ROLE_TAG_NAME, BRAND_MEMBER_ROLE_TAG_NAME])).length
  }), [users]);

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
        <div>
          <h3 style={{ margin: 0, fontSize: '18px' }}>用户列表</h3>
          <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
            全部 {roleCounts.all} · 管理员 {roleCounts.admin} · 代理商 {roleCounts.agent} · 品牌方 {roleCounts.brand}
          </div>
        </div>
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
                        {getInlineTags(user).map((tag) => (
                          <span
                            key={`${user.id}-${tag.key}`}
                            style={{
                              fontSize: '11px',
                              color: tag.color,
                              backgroundColor: tag.backgroundColor,
                              borderRadius: '999px',
                              padding: '2px 8px'
                            }}
                          >
                            {tag.label}
                          </span>
                        ))}
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
