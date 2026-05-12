import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';

const BRAND_LEAD_ROLE_TAG_NAME = '品牌方主理人';
const BRAND_MEMBER_ROLE_TAG_NAME = '品牌方';
const SYSTEM_ROLE_TAG_NAMES = ['超级管理员', '管理员', '代理商', BRAND_LEAD_ROLE_TAG_NAME, BRAND_MEMBER_ROLE_TAG_NAME];
const BRAND_SCOPE_TAG_NAMES = ['禅品', '文品', '香品', '茶品', '理悟课程'];
const SUPER_ADMIN_PHONE = '16601061656';
const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '').slice(-11);

const TagManager = ({ user, isOpen, onClose, allTags, tagCategories, onUpdateUserTags }) => {
  const [userTags, setUserTags] = useState(() => user?.tags || []);
  const [selectedTagId, setSelectedTagId] = useState('');

  const categoriesById = useMemo(
    () => new Map(tagCategories.map((category) => [category.id, category])),
    [tagCategories]
  );

  const otherTags = useMemo(() => {
    const nonRoleTags = allTags.filter((tag) => !SYSTEM_ROLE_TAG_NAMES.includes(String(tag?.name || '').trim()));
    const uniqueByName = new Map();
    nonRoleTags.forEach((tag) => {
      const tagName = String(tag?.name || '').trim();
      if (tagName && !uniqueByName.has(tagName)) {
        uniqueByName.set(tagName, tag);
      }
    });
    return [...uniqueByName.values()].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'));
  }, [allTags]);

  const roleTags = useMemo(() => {
    const uniqueByName = new Map();
    allTags.forEach((tag) => {
      const tagName = String(tag?.name || '').trim();
      if (SYSTEM_ROLE_TAG_NAMES.includes(tagName) && !uniqueByName.has(tagName)) {
        uniqueByName.set(tagName, tag);
      }
    });
    return [...uniqueByName.values()];
  }, [allTags]);

  const assignedRoleTagIds = useMemo(
    () => new Set(userTags.filter((tag) => SYSTEM_ROLE_TAG_NAMES.includes(String(tag.name || '').trim())).map((tag) => tag.id)),
    [userTags]
  );

  const isSuperAdminUser = normalizePhone(user?.phone || '') === SUPER_ADMIN_PHONE;

  const toggleTag = (tag) => {
    if (!tag?.id) {
      return;
    }

    const tagName = String(tag.name || '').trim();
    if (isSuperAdminUser && tagName === '超级管理员') {
      return;
    }

    setUserTags((currentTags) => {
      const exists = currentTags.some((item) => item.id === tag.id);
      if (exists) {
        return currentTags.filter((item) => item.id !== tag.id);
      }

      return [
        ...currentTags,
        {
          ...tag,
          assignedDate: new Date().toISOString().split('T')[0]
        }
      ];
    });
  };

  const handleToggleRoleTag = (tag) => {
    if (!tag?.id) {
      return;
    }

    if (isSuperAdminUser && String(tag.name || '').trim() === '超级管理员') {
      return;
    }

    setUserTags((currentTags) => {
      const exists = currentTags.some((item) => item.id === tag.id);
      if (exists) {
        return currentTags.filter((item) => item.id !== tag.id);
      }

      return [
        ...currentTags,
        {
          ...tag,
          assignedDate: new Date().toISOString().split('T')[0]
        }
      ];
    });
  };

  const handleSaveChanges = async () => {
    const hasBrandLeadRole = userTags.some((tag) => String(tag.name || '').trim() === BRAND_LEAD_ROLE_TAG_NAME);
    const hasBrandScope = userTags.some((tag) => BRAND_SCOPE_TAG_NAMES.includes(String(tag.name || '').trim()));

    if (hasBrandLeadRole && !hasBrandScope) {
      window.alert('品牌方主理人至少需要分配一个二级标签：禅品 / 文品 / 香品 / 茶品 / 理悟课程。');
      return;
    }

    await onUpdateUserTags(user.id, userTags);
    onClose();
  };

  const getCategoryName = (categoryId) => categoriesById.get(categoryId)?.name || '未分类';

  const renderTagChips = (tags) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
      {tags.map((tag) => {
        const assignedTag = userTags.find((item) => item.id === tag.id);
        const active = Boolean(assignedTag);
        const assignedDate = assignedTag?.assignedDate || '';

        return (
          <button
            key={tag.id}
            type="button"
            title={active && assignedDate ? `分配时间：${assignedDate}` : active ? '已分配' : '未分配'}
            onClick={() => toggleTag(tag)}
            disabled={isSuperAdminUser && String(tag.name || '').trim() === '超级管理员'}
            style={{
              border: 'none',
              borderRadius: '999px',
              padding: '10px 14px',
              backgroundColor: active ? '#111827' : '#f8fafc',
              color: active ? '#fff' : '#334155',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 700,
              opacity: isSuperAdminUser && String(tag.name || '').trim() === '超级管理员' ? 0.8 : 1
            }}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );

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
        maxWidth: '640px',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>管理 {user?.name} 的标签</h3>
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

        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>角色标签</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            {roleTags.map((tag) => {
              const active = assignedRoleTagIds.has(tag.id);
              const disabled = isSuperAdminUser && String(tag.name || '').trim() === '超级管理员';
              const assignedTag = userTags.find((item) => item.id === tag.id);
              const assignedDate = assignedTag?.assignedDate || '';

              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleToggleRoleTag(tag)}
                  disabled={disabled}
                  title={active && assignedDate ? `分配时间：${assignedDate}` : active ? '已分配' : '未分配'}
                  style={{
                    border: 'none',
                    borderRadius: '999px',
                    padding: '10px 14px',
                    backgroundColor: active ? '#111827' : '#f8fafc',
                    color: active ? '#fff' : '#334155',
                    cursor: disabled ? 'default' : 'pointer',
                    fontSize: '13px',
                    fontWeight: 700,
                    opacity: disabled ? 0.8 : 1
                  }}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>
            这里用于分配合作伙伴与后台权限标签。手机号 16601061656 对应用户会固定保留【超级管理员】。品牌方主理人必须绑定至少一个品牌品类二级标签。
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>其它标签</h4>
          {otherTags.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>当前没有可分配的其它标签。</div>
          ) : renderTagChips(otherTags)}
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
            type="button"
            onClick={handleSaveChanges}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#FF9800',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            保存标签
          </button>
        </div>
      </div>
    </div>
  );
};

export default TagManager;
