import React, { useMemo, useState } from 'react';
import { Plus, Tag as TagIcon, Trash2, X } from 'lucide-react';

const TagManager = ({ user, isOpen, onClose, allTags, tagCategories, onUpdateUserTags }) => {
  const [userTags, setUserTags] = useState(() => user?.tags || []);
  const [selectedTagId, setSelectedTagId] = useState('');

  const categoriesById = useMemo(
    () => new Map(tagCategories.map((category) => [category.id, category])),
    [tagCategories]
  );

  const availableTags = useMemo(() => {
    const assignedTagIds = new Set(userTags.map((tag) => tag.id));
    return allTags.filter((tag) => !assignedTagIds.has(tag.id));
  }, [allTags, userTags]);

  const handleAddTag = () => {
    if (!selectedTagId) {
      return;
    }

    const tagToAdd = allTags.find((tag) => tag.id === selectedTagId);
    if (!tagToAdd) {
      return;
    }

    setUserTags((currentTags) => [
      ...currentTags,
      {
        ...tagToAdd,
        assignedDate: new Date().toISOString().split('T')[0]
      }
    ]);
    setSelectedTagId('');
  };

  const handleDeleteTag = (tagId) => {
    setUserTags((currentTags) => currentTags.filter((tag) => tag.id !== tagId));
  };

  const handleSaveChanges = async () => {
    await onUpdateUserTags(user.id, userTags);
    onClose();
  };

  const getCategoryName = (categoryId) => categoriesById.get(categoryId)?.name || '未分类';

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
          <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>当前标签</h4>
          {userTags.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#666', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              暂无标签
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {userTags.map((tag) => (
                <div
                  key={tag.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    border: '1px solid #eee',
                    borderRadius: '8px',
                    backgroundColor: '#fafafa'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TagIcon size={16} color={tag.color || '#666'} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500 }}>{tag.name}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {getCategoryName(tag.categoryId)}{tag.assignedDate ? ` · 分配于 ${tag.assignedDate}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteTag(tag.id)}
                    style={{ padding: '4px', border: 'none', borderRadius: '4px', backgroundColor: '#f0f0f0', cursor: 'pointer' }}
                  >
                    <Trash2 size={14} color="#666" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h4 style={{ fontSize: '16px', marginBottom: '12px' }}>分配现有标签</h4>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>可选标签</label>
              <select
                value={selectedTagId}
                onChange={(e) => setSelectedTagId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px' }}
              >
                <option value="">选择标签</option>
                {availableTags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name} · {getCategoryName(tag.categoryId)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddTag}
              disabled={!selectedTagId}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: selectedTagId ? '#2196F3' : '#bbdefb',
                color: '#fff',
                cursor: selectedTagId ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={14} />
              添加
            </button>
          </div>
          {availableTags.length === 0 && (
            <div style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
              该用户已经分配了所有可用标签。
            </div>
          )}
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
