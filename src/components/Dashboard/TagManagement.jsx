import React, { useMemo, useState } from 'react';
import { X, Plus, Edit2, Trash2, Save, Tag as TagIcon, Folder, Eye, Users } from 'lucide-react';

const TagManagement = ({ tagCategories, tags, users, onUpdateCategories, onUpdateTags }) => {
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingTag, setEditingTag] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedViewer, setSelectedViewer] = useState(null);

  const categoryById = useMemo(() => (
    new Map(tagCategories.map((category) => [category.id, category]))
  ), [tagCategories]);

  const userCountByCategoryId = useMemo(() => {
    const counts = new Map();

    users.forEach((user) => {
      const seenCategoryIds = new Set();

      user.tags.forEach((tag) => {
        if (!tag.categoryId || seenCategoryIds.has(tag.categoryId)) {
          return;
        }

        counts.set(tag.categoryId, (counts.get(tag.categoryId) || 0) + 1);
        seenCategoryIds.add(tag.categoryId);
      });
    });

    return counts;
  }, [users]);

  const userCountByTagId = useMemo(() => {
    const counts = new Map();

    users.forEach((user) => {
      const seenTagIds = new Set();

      user.tags.forEach((tag) => {
        if (!tag.id || seenTagIds.has(tag.id)) {
          return;
        }

        counts.set(tag.id, (counts.get(tag.id) || 0) + 1);
        seenTagIds.add(tag.id);
      });
    });

    return counts;
  }, [users]);

  const activeViewer = useMemo(() => {
    if (!selectedViewer) {
      return null;
    }

    if (selectedViewer.type === 'category') {
      const category = tagCategories.find((item) => item.id === selectedViewer.id);

      if (!category) {
        return null;
      }

      return {
        type: 'category',
        id: category.id,
        name: category.name,
        color: category.color,
        userCount: userCountByCategoryId.get(category.id) || 0
      };
    }

    const tag = tags.find((item) => item.id === selectedViewer.id);

    if (!tag) {
      return null;
    }

    return {
      type: 'tag',
      id: tag.id,
      name: tag.name,
      color: tag.color || categoryById.get(tag.categoryId)?.color || '#666',
      categoryId: tag.categoryId,
      categoryName: categoryById.get(tag.categoryId)?.name || '未分类',
      userCount: userCountByTagId.get(tag.id) || 0
    };
  }, [categoryById, selectedViewer, tagCategories, tags, userCountByCategoryId, userCountByTagId]);

  const viewerUsers = useMemo(() => {
    if (!activeViewer) {
      return [];
    }

    return users.filter((user) => (
      activeViewer.type === 'category'
        ? user.tags.some((tag) => tag.categoryId === activeViewer.id)
        : user.tags.some((tag) => tag.id === activeViewer.id)
    ));
  }, [activeViewer, users]);

  const getMatchingTags = (user) => {
    if (!activeViewer) {
      return [];
    }

    return user.tags.filter((tag) => (
      activeViewer.type === 'category'
        ? tag.categoryId === activeViewer.id
        : tag.id === activeViewer.id
    ));
  };

  const getUserInitial = (name) => (name || '用').trim().slice(0, 1) || '用';

  const handleEditCategory = (category) => {
    setEditingCategory({ ...category });
  };

  const handleSaveCategory = async () => {
    if (editingCategory && editingCategory.name.trim()) {
      if (editingCategory.name.length > 4) {
        alert('分类名称最多 4 个字');
        return;
      }
      await onUpdateCategories(editingCategory);
      setEditingCategory(null);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (window.confirm('确定删除这个分类吗？该分类下的标签也会一起删除。')) {
      const tagsToDelete = tags.filter(tag => tag.categoryId === categoryId);
      await Promise.all(
        tagsToDelete.map((tag) => onUpdateTags({ id: tag.id, action: 'delete' }))
      );
      await onUpdateCategories({ id: categoryId, action: 'delete' });
      setSelectedViewer((current) => {
        if (!current) {
          return null;
        }

        if (current.type === 'category' && current.id === categoryId) {
          return null;
        }

        if (current.type === 'tag' && tagsToDelete.some((tag) => tag.id === current.id)) {
          return null;
        }

        return current;
      });
    }
  };

  const handleAddCategory = async () => {
    if (newCategoryName.trim() && newCategoryName.length <= 4) {
      const newCategory = {
        id: `cat_${Date.now()}`,
        name: newCategoryName.trim(),
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
      };
      await onUpdateCategories(newCategory);
      setNewCategoryName('');
    } else if (newCategoryName.length > 4) {
      alert('分类名称最多 4 个字');
    }
  };

  const handleEditTag = (tag) => {
    setEditingTag({ ...tag });
  };

  const handleSaveTag = async () => {
    if (editingTag && editingTag.name.trim()) {
      await onUpdateTags(editingTag);
      setEditingTag(null);
    }
  };

  const handleDeleteTag = async (tagId) => {
    if (window.confirm('确定删除这个标签吗？')) {
      await onUpdateTags({ id: tagId, action: 'delete' });
      setSelectedViewer((current) => (
        current?.type === 'tag' && current.id === tagId ? null : current
      ));
    }
  };

  const handleAddTag = async () => {
    if (newTagName.trim() && selectedCategory) {
      const category = tagCategories.find(cat => cat.id === selectedCategory);
      const newTag = {
        id: `tag_${Date.now()}`,
        name: newTagName.trim(),
        categoryId: selectedCategory,
        categoryName: category.name,
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        color: category.color
      };
      await onUpdateTags(newTag);
      setNewTagName('');
      setSelectedCategory('');
    }
  };

  function getCategoryName(categoryId) {
    const category = categoryById.get(categoryId);
    return category ? category.name : '未分类';
  }

  function getCategoryColor(categoryId) {
    const category = categoryById.get(categoryId);
    return category ? category.color : '#666';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
        {/* Category Management */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Folder size={20} color="#FF9800" />
              标签分类
            </h3>
          </div>

          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>
                  新建分类（最多 4 个字）
                </label>
                <input
                  type="text"
                  placeholder="输入分类名称"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  maxLength={4}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                />
              </div>
              <button
                onClick={handleAddCategory}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#FF9800',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={14} />
                新增
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {tagCategories.map((category) => (
              <div key={category.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                border: '1px solid #eee',
                borderRadius: '8px',
                backgroundColor: '#fafafa'
              }}>
                {editingCategory?.id === category.id ? (
                  <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                    <input
                      type="text"
                      value={editingCategory.name}
                      onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                      maxLength={4}
                      style={{ flex: 1, padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                    />
                    <button
                      onClick={handleSaveCategory}
                      style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#4CAF50', color: 'white', cursor: 'pointer' }}
                    >
                      <Save size={14} />
                    </button>
                    <button
                      onClick={() => setEditingCategory(null)}
                      style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#666', color: 'white', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        backgroundColor: category.color,
                        flexShrink: 0
                      }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{category.name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {tags.filter((tag) => tag.categoryId === category.id).length} 个标签 · {userCountByCategoryId.get(category.id) || 0} 位用户
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => setSelectedViewer({ type: 'category', id: category.id })}
                        style={{
                          padding: '4px 8px',
                          border: 'none',
                          borderRadius: '4px',
                          backgroundColor: '#FFF3E0',
                          color: '#E65100',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Eye size={14} />
                        用户
                      </button>
                      <button
                        onClick={() => handleEditCategory(category)}
                        style={{ padding: '4px', border: 'none', borderRadius: '4px', backgroundColor: '#f0f0f0', cursor: 'pointer' }}
                      >
                        <Edit2 size={14} color="#666" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        style={{ padding: '4px', border: 'none', borderRadius: '4px', backgroundColor: '#f0f0f0', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} color="#666" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tag Management */}
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TagIcon size={20} color="#2196F3" />
              标签
            </h3>
          </div>

          <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>
                  标签名称
                </label>
                <input
                  type="text"
                  placeholder="输入标签名称"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500 }}>
                  所属分类
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                >
                  <option value="">请选择分类</option>
                  {tagCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddTag}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#2196F3',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={14} />
                新增
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
            {tags.map((tag) => (
              <div key={tag.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                border: '1px solid #eee',
                borderRadius: '8px',
                backgroundColor: '#fafafa'
              }}>
                {editingTag?.id === tag.id ? (
                  <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                    <input
                      type="text"
                      value={editingTag.name}
                      onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                      style={{ flex: 1, padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                    />
                    <select
                      value={editingTag.categoryId}
                      onChange={(e) => setEditingTag({ ...editingTag, categoryId: e.target.value })}
                      style={{ padding: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px' }}
                    >
                      {tagCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleSaveTag}
                      style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#4CAF50', color: 'white', cursor: 'pointer' }}
                    >
                      <Save size={14} />
                    </button>
                    <button
                      onClick={() => setEditingTag(null)}
                      style={{ padding: '4px 8px', border: 'none', borderRadius: '4px', backgroundColor: '#666', color: 'white', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <TagIcon size={16} color={getCategoryColor(tag.categoryId)} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>{tag.name}</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '12px', color: '#666', backgroundColor: getCategoryColor(tag.categoryId) + '20', padding: '2px 6px', borderRadius: '4px' }}>
                            {getCategoryName(tag.categoryId)}
                          </span>
                          <span style={{ fontSize: '12px', color: '#666' }}>
                            {userCountByTagId.get(tag.id) || 0} 位用户
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        onClick={() => setSelectedViewer({ type: 'tag', id: tag.id })}
                        style={{
                          padding: '4px 8px',
                          border: 'none',
                          borderRadius: '4px',
                          backgroundColor: '#E3F2FD',
                          color: '#1565C0',
                          cursor: 'pointer',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Eye size={14} />
                        用户
                      </button>
                      <button
                        onClick={() => handleEditTag(tag)}
                        style={{ padding: '4px', border: 'none', borderRadius: '4px', backgroundColor: '#f0f0f0', cursor: 'pointer' }}
                      >
                        <Edit2 size={14} color="#666" />
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        style={{ padding: '4px', border: 'none', borderRadius: '4px', backgroundColor: '#f0f0f0', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} color="#666" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        backgroundColor: '#fff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={20} color={activeViewer?.color || '#4F46E5'} />
              {activeViewer
                ? `${activeViewer.type === 'category' ? '分类' : '标签'}用户列表`
                : '用户列表'}
            </h3>
            <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#666' }}>
              {activeViewer
                ? `${activeViewer.name} · ${activeViewer.userCount} 位用户`
                : '选择上方某个分类或标签后，这里会列出对应用户。'}
            </p>
          </div>
          {activeViewer && (
            <button
              onClick={() => setSelectedViewer(null)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                backgroundColor: '#fff',
                color: '#666',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              清除筛选
            </button>
          )}
        </div>

        {!activeViewer && (
          <div style={{
            border: '1px dashed #ddd',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            color: '#666',
            fontSize: '14px',
            backgroundColor: '#fafafa'
          }}>
            先从上方选择一个分类或标签，再查看对应用户。
          </div>
        )}

        {activeViewer && viewerUsers.length === 0 && (
          <div style={{
            border: '1px dashed #ddd',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            color: '#666',
            fontSize: '14px',
            backgroundColor: '#fafafa'
          }}>
            当前筛选下还没有关联用户。
          </div>
        )}

        {activeViewer && viewerUsers.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {viewerUsers.map((user) => {
              const matchingTags = getMatchingTags(user);

              return (
                <div
                  key={user.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    border: '1px solid #eee',
                    borderRadius: '12px',
                    backgroundColor: '#fafafa',
                    flexWrap: 'wrap'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: '#E3F2FD',
                        color: '#1565C0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        {getUserInitial(user.name)}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#222' }}>{user.name || '未命名用户'}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{user.email || user.phone || '未填写联系方式'}</div>
                      <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>用户 ID：{user.id}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '999px',
                      fontSize: '12px',
                      backgroundColor: user.status === 'active' ? '#E8F5E9' : '#F5F5F5',
                      color: user.status === 'active' ? '#2E7D32' : '#757575'
                    }}>
                      {user.status === 'active' ? '活跃' : '不活跃'}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {matchingTags.map((tag) => (
                        <span
                          key={`${user.id}-${tag.id}`}
                          style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            backgroundColor: `${tag.color || '#666'}20`,
                            color: tag.color || '#666'
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TagManagement;
