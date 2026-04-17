// 标签系统数据模型

// 标签分类（最多4个汉字）
export const tagCategories = [
  { id: 'growth', name: '成长', color: '#4CAF50', description: '个人成长相关' },
  { id: 'emotion', name: '情绪', color: '#FF9800', description: '情绪管理' },
  { id: 'habit', name: '习惯', color: '#2196F3', description: '习惯养成' },
  { id: 'health', name: '健康', color: '#F44336', description: '身心健康' },
  { id: 'relation', name: '关系', color: '#9C27B0', description: '人际关系' },
  { id: 'work', name: '工作', color: '#607D8B', description: '职场发展' },
  { id: 'study', name: '学习', color: '#795548', description: '学习提升' },
  { id: 'life', name: '生活', color: '#009688', description: '生活方式' }
];

// 具体标签
export const mockTags = [
  // 成长类
  { id: 'tag_001', name: '正念练习', categoryId: 'growth', startDate: '2024-01-01', endDate: '2024-12-31', color: '#4CAF50' },
  { id: 'tag_002', name: '自我觉察', categoryId: 'growth', startDate: '2024-02-01', endDate: '2024-11-30', color: '#4CAF50' },
  { id: 'tag_003', name: '目标达成', categoryId: 'growth', startDate: '2024-03-01', endDate: '2024-12-31', color: '#4CAF50' },
  
  // 情绪类
  { id: 'tag_004', name: '焦虑管理', categoryId: 'emotion', startDate: '2024-01-15', endDate: '2024-06-15', color: '#FF9800' },
  { id: 'tag_005', name: '压力释放', categoryId: 'emotion', startDate: '2024-02-15', endDate: '2024-08-15', color: '#FF9800' },
  { id: 'tag_006', name: '情绪调节', categoryId: 'emotion', startDate: '2024-03-15', endDate: '2024-09-15', color: '#FF9800' },
  
  // 习惯类
  { id: 'tag_007', name: '早起', categoryId: 'habit', startDate: '2024-01-01', endDate: '2024-12-31', color: '#2196F3' },
  { id: 'tag_008', name: '运动健身', categoryId: 'habit', startDate: '2024-01-10', endDate: '2024-12-31', color: '#2196F3' },
  { id: 'tag_009', name: '阅读', categoryId: 'habit', startDate: '2024-02-01', endDate: '2024-12-31', color: '#2196F3' },
  
  // 健康类
  { id: 'tag_010', name: '睡眠改善', categoryId: 'health', startDate: '2024-01-20', endDate: '2024-07-20', color: '#F44336' },
  { id: 'tag_011', name: '饮食健康', categoryId: 'health', startDate: '2024-02-20', endDate: '2024-08-20', color: '#F44336' },
  { id: 'tag_012', name: '体重管理', categoryId: 'health', startDate: '2024-03-20', endDate: '2024-09-20', color: '#F44336' },
  
  // 关系类
  { id: 'tag_013', name: '家庭和谐', categoryId: 'relation', startDate: '2024-01-05', endDate: '2024-12-31', color: '#9C27B0' },
  { id: 'tag_014', name: '友谊维护', categoryId: 'relation', startDate: '2024-02-05', endDate: '2024-12-31', color: '#9C27B0' },
  { id: 'tag_015', name: '沟通技巧', categoryId: 'relation', startDate: '2024-03-05', endDate: '2024-12-31', color: '#9C27B0' },
  
  // 工作类
  { id: 'tag_016', name: '效率提升', categoryId: 'work', startDate: '2024-01-10', endDate: '2024-12-31', color: '#607D8B' },
  { id: 'tag_017', name: '时间管理', categoryId: 'work', startDate: '2024-02-10', endDate: '2024-12-31', color: '#607D8B' },
  { id: 'tag_018', name: '职业规划', categoryId: 'work', startDate: '2024-03-10', endDate: '2024-12-31', color: '#607D8B' },
  
  // 学习类
  { id: 'tag_019', name: '技能学习', categoryId: 'study', startDate: '2024-01-25', endDate: '2024-12-31', color: '#795548' },
  { id: 'tag_020', name: '知识积累', categoryId: 'study', startDate: '2024-02-25', endDate: '2024-12-31', color: '#795548' },
  { id: 'tag_021', name: '思维训练', categoryId: 'study', startDate: '2024-03-25', endDate: '2024-12-31', color: '#795548' },
  
  // 生活类
  { id: 'tag_022', name: '极简生活', categoryId: 'life', startDate: '2024-01-30', endDate: '2024-12-31', color: '#009688' },
  { id: 'tag_023', name: '环保生活', categoryId: 'life', startDate: '2024-02-28', endDate: '2024-12-31', color: '#009688' },
  { id: 'tag_024', name: '品质生活', categoryId: 'life', startDate: '2024-03-30', endDate: '2024-12-31', color: '#009688' }
];

// 为用户随机分配标签
export const assignTagsToUsers = (users, tags) => {
  const usersWithTags = users.map(user => {
    const numTags = Math.floor(Math.random() * 4) + 1; // 每个用户1-4个标签
    const selectedTags = [];
    const usedTagIds = new Set();
    
    for (let i = 0; i < numTags && i < tags.length; i++) {
      let randomIndex;
      do {
        randomIndex = Math.floor(Math.random() * tags.length);
      } while (usedTagIds.has(tags[randomIndex].id));
      
      usedTagIds.add(tags[randomIndex].id);
      selectedTags.push({
        ...tags[randomIndex],
        assignedDate: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
    }
    
    return {
      ...user,
      tags: selectedTags
    };
  });
  
  return usersWithTags;
};
