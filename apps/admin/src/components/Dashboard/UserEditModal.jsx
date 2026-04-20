import React, { useEffect, useState } from 'react';
import { X, Save } from 'lucide-react';

const createFormData = (user) => ({
  name: user?.name || '',
  noteName: user?.noteName || '',
  email: user?.email || '',
  phone: user?.phone || '',
  bio: user?.bio || '',
  location: user?.location || '',
  age: user?.age || '',
  status: user?.status || 'active',
  level: user?.level || 1,
  experience: user?.experience || 0,
  isStudent: Boolean(user?.isStudent)
});

const UserEditModal = ({ user, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState(() => createFormData(user));

  useEffect(() => {
    setFormData(createFormData(user));
  }, [user]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? e.target.checked : type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSave(user.id, formData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#fff',
        borderRadius: '16px',
        padding: '24px',
        width: '90%',
        maxWidth: '500px',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>编辑用户信息</h3>
          <button
            onClick={onClose}
            style={{ 
              border: 'none', 
              background: 'none', 
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px'
            }}
          >
            <X size={20} color="#666" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>姓名</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              style={{ 
                width: '100%', 
                padding: '8px 12px', 
                border: '1px solid #ddd', 
                borderRadius: '8px',
                fontSize: '14px'
              }}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>备注名</label>
            <input
              type="text"
              name="noteName"
              value={formData.noteName}
              onChange={handleChange}
              placeholder="仅后台可见，便于管理员识别用户"
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>邮箱</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>手机号</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>简介</label>
            <textarea
              name="bio"
              value={formData.bio}
              onChange={handleChange}
              style={{ 
                width: '100%', 
                padding: '8px', 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                fontSize: '14px',
                minHeight: '60px',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>地区</label>
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>年龄</label>
              <input
                type="number"
                name="age"
                value={formData.age}
                onChange={handleChange}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>状态</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="active">活跃</option>
                <option value="inactive">不活跃</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>等级</label>
              <input
                type="number"
                name="level"
                value={formData.level}
                onChange={handleChange}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: 500 }}>经验值</label>
              <input
                type="number"
                name="experience"
                value={formData.experience}
                onChange={handleChange}
                style={{ 
                  width: '100%', 
                  padding: '8px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '10px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              marginBottom: '16px',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              name="isStudent"
              checked={formData.isStudent}
              onChange={handleChange}
              style={{ width: '18px', height: '18px' }}
            />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>学员身份</div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                开启后，此用户可以发布和复用学员觉察标签。
              </div>
            </div>
          </label>

          <div style={{ marginBottom: '24px', padding: '12px 14px', borderRadius: '10px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '12px', lineHeight: 1.6 }}>
            <div>邀请口令：{user?.uid || '尚未生成'}</div>
            <div>云端 UID：{user?.authUid || '未绑定匿名登录'}</div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: '#2196F3',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Save size={16} />
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserEditModal;
