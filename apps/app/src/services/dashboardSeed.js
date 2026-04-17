import DatabaseService from './database.js';

export const DASHBOARD_SEED_BATCH = 'dashboard_mock_v1';

export const seedDashboardData = async () => {
  const { mockUsers } = await import('../data/mockUsers.js');
  const { mockTags, tagCategories, assignTagsToUsers } = await import('../data/mockTags.js');

  const categoryMap = {};
  for (const category of tagCategories) {
    const categoryId = await DatabaseService.createCategory({
      name: category.name,
      color: category.color,
      description: category.description,
      seed_batch: DASHBOARD_SEED_BATCH,
      seed_origin_id: category.id
    });
    categoryMap[category.id] = categoryId;
  }

  const tagMap = {};
  for (const tag of mockTags) {
    const tagId = await DatabaseService.createTag({
      name: tag.name,
      categoryId: categoryMap[tag.categoryId],
      startDate: tag.startDate,
      endDate: tag.endDate,
      color: tag.color,
      seed_batch: DASHBOARD_SEED_BATCH,
      seed_origin_id: tag.id
    });
    tagMap[tag.id] = tagId;
  }

  const userMap = {};
  for (const user of mockUsers) {
    const userId = await DatabaseService.createUser({
      name: user.name,
      avatar: user.avatar,
      email: user.email,
      phone: user.phone,
      joinDate: user.joinDate,
      lastActive: user.lastActive,
      status: user.status,
      level: user.level,
      experience: user.experience,
      bio: user.bio,
      location: user.location,
      age: user.age,
      seed_batch: DASHBOARD_SEED_BATCH,
      seed_origin_id: user.id
    });
    userMap[user.id] = userId;
  }

  const usersWithTags = assignTagsToUsers(mockUsers, mockTags);
  for (const user of usersWithTags) {
    const tagIds = (user.tags || []).map((tag) => tagMap[tag.id]).filter(Boolean);
    await DatabaseService.updateUserTags(userMap[user.id], tagIds);
  }
};

export const seedDashboardDataIfEmpty = async () => {
  const [users, categories] = await Promise.all([
    DatabaseService.getUsers(),
    DatabaseService.getTagCategories()
  ]);

  if (users.length > 0 || categories.length > 0) {
    return false;
  }

  await seedDashboardData();
  return true;
};

