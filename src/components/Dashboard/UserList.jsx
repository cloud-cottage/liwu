import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

const UserList = ({ users, onEditUser, onManageTags }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = useMemo(() => {
    return users.filter(user => 
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const getStatusColor = (status) => {
    return status === 'active' ? '#4CAF50' : '#9E9E9E';
  };

  const getStatusText = (status) => {
    return status === 'active' ? '活跃' : '不活跃';
  };

  return (
    <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>用户列表</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '8px 12px' }}>
          <Search size={16} color="#666" />
          <input
            type="text"
            placeholder="搜索用户..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'none', outline: 'none', fontSize: '14px', width: '200px' }}
          />
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600, color: '#666' }}>用户</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: 600 }}>联系方式</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: 600 }}>状态</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: 600 }}>等级</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: 600 }}>标签</th>
              <th style={{ textAlign: 'left', padding: '12px 8px', borderBottom: '1px solid #eee', fontSize: '14px', fontWeight: 600 }}>注册时间</th>
              <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#666' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} style={{ borderBottom: '1px solid #f5f5f5', '&:hover': { backgroundColor: '#f9f9f9' } }}>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <img 
                      src={user.avatar} 
                      alt={user.name}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{user.name}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>用户 ID：{user.id}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  <div style={{ fontSize: '13px' }}>{user.email}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{user.phone}</div>
                </td>
                <td style={{ padding: '12px' }}>
                  <span style={{ 
                    display: 'inline-block', 
                    padding: '4px 8px', 
                    borderRadius: '12px', 
                    fontSize: '12px',
                    backgroundColor: getStatusColor(user.status) + '20',
                    color: getStatusColor(user.status)
                  }}>
                    {getStatusText(user.status)}
                  </span>
                </td>
                <td style={{ padding: '12px', fontSize: '14px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>等级 {user.level}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>{user.experience} 经验</div>
                </td>
                <td style={{ padding: '12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {user.tags.slice(0, 2).map((tag) => (
                      <span 
                        key={tag.id}
                        style={{ 
                          display: 'inline-block', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          fontSize: '11px',
                          backgroundColor: tag.color + '20',
                          color: tag.color
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {user.tags.length > 2 && (
                      <span style={{ fontSize: '12px', color: '#666' }}>+{user.tags.length - 2}</span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '12px', fontSize: '14px', color: '#666' }}>
                  {user.joinDate}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                      onClick={() => onEditUser(user)}
                      style={{
                        padding: '4px 8px',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: '#2196F3',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '12px',
                        marginRight: '4px'
                      }}
                    >
                      编辑
                    </button>
                    <button
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

      {filteredUsers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          没有找到匹配 "{searchTerm}" 的用户
        </div>
      )}

      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', color: '#666' }}>
        <div style={{ fontSize: '13px', color: '#666' }}>
          显示 {filteredUsers.length} / {users.length} 个用户
        </div>
      </div>
    </div>
  );
};

export default UserList;
