import React from 'react';
import { BarChart3, Users, Tag, TrendingUp } from 'lucide-react';

const TagStatistics = ({ users, tagCategories }) => {
  // Calculate tag statistics
  const calculateTagStats = () => {
    const tagStats = {};
    const categoryStats = {};
    
    // Initialize category stats
    tagCategories.forEach(category => {
      categoryStats[category.id] = {
        name: category.name,
        color: category.color,
        count: 0,
        users: new Set()
      };
    });
    
    // Count tags and categories
    users.forEach(user => {
      user.tags.forEach(tag => {
        // Tag statistics
        if (!tagStats[tag.id]) {
          tagStats[tag.id] = {
            name: tag.name,
            categoryId: tag.categoryId,
            categoryName: tagCategories.find(cat => cat.id === tag.categoryId)?.name || '未分类',
            color: tag.color,
            count: 0,
            users: new Set()
          };
        }
        tagStats[tag.id].count++;
        tagStats[tag.id].users.add(user.id);
        
        // Category statistics
        if (categoryStats[tag.categoryId]) {
          categoryStats[tag.categoryId].count++;
          categoryStats[tag.categoryId].users.add(user.id);
        }
      });
    });
    
    // Convert Sets to counts and sort
    const sortedTagStats = Object.values(tagStats)
      .map(stat => ({ ...stat, userCount: stat.users.size }))
      .sort((a, b) => b.userCount - a.userCount)
      .slice(0, 10); // Top 10 tags
    
    const sortedCategoryStats = Object.values(categoryStats)
      .map(stat => ({ ...stat, userCount: stat.users.size }))
      .sort((a, b) => b.userCount - a.userCount);
    
    return { sortedTagStats, sortedCategoryStats };
  };
  
  const { sortedTagStats, sortedCategoryStats } = calculateTagStats();
  
  const totalUsers = users.length;
  const totalTagAssignments = users.reduce((sum, user) => sum + user.tags.length, 0);
  const averageTagsPerUser = totalUsers > 0 ? (totalTagAssignments / totalUsers).toFixed(1) : 0;
  const usersWithTags = users.filter(user => user.tags.length > 0).length;
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      {/* Tag Statistics */}
      <div style={{ 
        backgroundColor: '#fff', 
        borderRadius: '16px', 
        padding: '20px', 
        boxShadow: 'var(--shadow-sm)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Tag size={20} color="#2196F3" />
          <h3 style={{ margin: 0, fontSize: '16px' }}>标签统计</h3>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3' }}>
            {sortedTagStats.length}
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>使用的不同标签</div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '14px', margin: '0 0 12px 0', color: '#666' }}>按用户数排序的热门标签</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sortedTagStats.slice(0, 5).map((tag, index) => (
              <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ 
                  width: '20px', 
                  height: '20px', 
                  borderRadius: '4px', 
                  backgroundColor: tag.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  color: 'white',
                  fontWeight: 'bold'
                }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{tag.name}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {tag.categoryName} · {tag.userCount} 个用户
                  </div>
                </div>
                <div style={{ 
                  width: '60px', 
                  height: '6px', 
                  backgroundColor: '#f0f0f0', 
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    width: `${(tag.userCount / totalUsers) * 100}%`, 
                    height: '100%', 
                    backgroundColor: tag.color 
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Category Statistics */}
      <div style={{ 
        backgroundColor: '#fff', 
        borderRadius: '16px', 
        padding: '20px', 
        boxShadow: 'var(--shadow-sm)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <BarChart3 size={20} color="#FF9800" />
          <h3 style={{ margin: 0, fontSize: '16px' }}>分类统计</h3>
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#FF9800' }}>
            {sortedCategoryStats.length}
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>活跃的标签分类</div>
        </div>
        
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '14px', margin: '0 0 12px 0', color: '#666' }}>按用户数排序的分类</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sortedCategoryStats.map((category) => (
              <div key={category.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ 
                  width: '20px', 
                  height: '20px', 
                  borderRadius: '4px', 
                  backgroundColor: category.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    backgroundColor: 'white' 
                  }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{category.name}</div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {category.userCount} 个用户 · {category.count} 次分配
                  </div>
                </div>
                <div style={{ 
                  width: '60px', 
                  height: '6px', 
                  backgroundColor: '#f0f0f0', 
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{ 
                    width: `${(category.userCount / totalUsers) * 100}%`, 
                    height: '100%', 
                    backgroundColor: category.color 
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Overall Statistics */}
      <div style={{ 
        backgroundColor: '#fff', 
        borderRadius: '16px', 
        padding: '20px', 
        boxShadow: 'var(--shadow-sm)',
        gridColumn: '1 / -1'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <TrendingUp size={20} color="#4CAF50" />
          <h3 style={{ margin: 0, fontSize: '16px' }}>总体统计</h3>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <Users size={24} color="#2196F3" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2196F3' }}>{totalUsers}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>总用户数</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <Users size={24} color="#4CAF50" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4CAF50' }}>{usersWithTags}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>有标签用户</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <Tag size={24} color="#FF9800" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#FF9800' }}>{totalTagAssignments}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>总标签分配</div>
          </div>
          
          <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <BarChart3 size={24} color="#9C27B0" style={{ marginBottom: '8px' }} />
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#9C27B0' }}>{averageTagsPerUser}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>平均每用户标签数</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TagStatistics;
