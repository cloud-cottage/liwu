// 模拟用户数据
const surnames = ['张', '王', '李', '赵', '刘', '陈', '杨', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高'];
const givenNames = ['伟', '芳', '娜', '敏', '静', '丽', '强', '磊', '洋', '艳', '勇', '军', '杰', '娟', '涛', '明', '超', '秀英', '桂英', '燕'];

const generateRandomName = () => {
  const surname = surnames[Math.floor(Math.random() * surnames.length)];
  const givenName1 = givenNames[Math.floor(Math.random() * givenNames.length)];
  const givenName2 = Math.random() > 0.5 ? givenNames[Math.floor(Math.random() * givenNames.length)] : '';
  return surname + givenName1 + givenName2;
};

const generateRandomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const generateMockUsers = () => {
  const users = [];
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  
  for (let i = 1; i <= 100; i++) {
    const joinDate = generateRandomDate(oneYearAgo, now);
    const lastActive = generateRandomDate(joinDate, now);
    
    users.push({
      id: i.toString(),
      name: generateRandomName(),
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`,
      email: `user${i}@example.com`,
      phone: `1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
      joinDate: joinDate.toISOString().split('T')[0],
      lastActive: lastActive.toISOString(),
      status: Math.random() > 0.2 ? 'active' : 'inactive',
      level: Math.floor(Math.random() * 10) + 1,
      experience: Math.floor(Math.random() * 10000),
      tags: [],
      bio: `这是用户${i}的个人简介，喜欢正念冥想和内心成长。`,
      location: ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安'][Math.floor(Math.random() * 8)],
      age: Math.floor(Math.random() * 40) + 18
    });
  }
  
  return users;
};

export const mockUsers = generateMockUsers();
