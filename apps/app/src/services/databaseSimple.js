import { mockUsers } from '../data/mockUsers.js';
import { assignTagsToUsers, mockTags, tagCategories } from '../data/mockTags.js';

const STORAGE_KEYS = {
  users: 'dashboardUsers',
  tags: 'dashboardTags',
  categories: 'tagCategories'
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const buildInitialData = () => ({
  users: assignTagsToUsers(mockUsers, mockTags),
  tags: clone(mockTags),
  categories: clone(tagCategories)
});

const persistData = (data) => {
  localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(data.users));
  localStorage.setItem(STORAGE_KEYS.tags, JSON.stringify(data.tags));
  localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(data.categories));
};

const loadStoredData = () => {
  const storedUsers = localStorage.getItem(STORAGE_KEYS.users);
  const storedTags = localStorage.getItem(STORAGE_KEYS.tags);
  const storedCategories = localStorage.getItem(STORAGE_KEYS.categories);

  if (!storedUsers || !storedTags || !storedCategories) {
    const initialData = buildInitialData();
    persistData(initialData);
    return initialData;
  }

  return {
    users: JSON.parse(storedUsers),
    tags: JSON.parse(storedTags),
    categories: JSON.parse(storedCategories)
  };
};

const withStoredData = (mutator) => {
  const data = loadStoredData();
  const nextData = mutator({
    users: clone(data.users),
    tags: clone(data.tags),
    categories: clone(data.categories)
  });

  persistData(nextData);
  return nextData;
};

const syncUserTagsWithTag = (tag, users) => (
  users.map((user) => ({
    ...user,
    tags: user.tags.map((userTag) => (
      userTag.id === tag.id
        ? {
            ...userTag,
            ...tag,
            assignedDate: userTag.assignedDate || new Date().toISOString().split('T')[0]
          }
        : userTag
    ))
  }))
);

class SimpleDatabaseService {
  static async initializeData() {
    return clone(loadStoredData());
  }

  static async getUsers() {
    const data = await this.initializeData();
    return data.users;
  }

  static async createUser(userData) {
    const newUser = {
      ...userData,
      id: `user_${Date.now()}`,
      tags: userData.tags || []
    };

    withStoredData((data) => ({
      ...data,
      users: [...data.users, newUser]
    }));

    return newUser.id;
  }

  static async updateUser(userId, userData) {
    withStoredData((data) => ({
      ...data,
      users: data.users.map((user) => (
        user.id === userId
          ? {
              ...user,
              ...userData,
              id: user.id,
              tags: user.tags
            }
          : user
      ))
    }));
  }

  static async deleteUser(userId) {
    withStoredData((data) => ({
      ...data,
      users: data.users.filter((user) => user.id !== userId)
    }));
  }

  static async getTagCategories() {
    const data = await this.initializeData();
    return data.categories;
  }

  static async createCategory(categoryData) {
    const category = {
      ...categoryData,
      id: categoryData.id || `cat_${Date.now()}`
    };

    withStoredData((data) => ({
      ...data,
      categories: [...data.categories, category]
    }));

    return category.id;
  }

  static async updateCategory(categoryId, categoryData) {
    withStoredData((data) => {
      const nextCategories = data.categories.map((category) => (
        category.id === categoryId
          ? {
              ...category,
              ...categoryData,
              id: category.id
            }
          : category
      ));

      const category = nextCategories.find((item) => item.id === categoryId);
      const nextTags = data.tags.map((tag) => (
        tag.categoryId === categoryId
          ? {
              ...tag,
              categoryName: category?.name || tag.categoryName,
              color: category?.color || tag.color
            }
          : tag
      ));

      return {
        ...data,
        categories: nextCategories,
        tags: nextTags,
        users: nextTags.reduce(
          (users, tag) => syncUserTagsWithTag(tag, users),
          data.users
        )
      };
    });
  }

  static async deleteCategory(categoryId) {
    withStoredData((data) => {
      const removedTagIds = new Set(
        data.tags.filter((tag) => tag.categoryId === categoryId).map((tag) => tag.id)
      );

      return {
        ...data,
        categories: data.categories.filter((category) => category.id !== categoryId),
        tags: data.tags.filter((tag) => tag.categoryId !== categoryId),
        users: data.users.map((user) => ({
          ...user,
          tags: user.tags.filter((tag) => !removedTagIds.has(tag.id))
        }))
      };
    });
  }

  static async getTags() {
    const data = await this.initializeData();
    return data.tags;
  }

  static async createTag(tagData) {
    const tag = {
      ...tagData,
      id: tagData.id || `tag_${Date.now()}`
    };

    withStoredData((data) => ({
      ...data,
      tags: [...data.tags, tag]
    }));

    return tag.id;
  }

  static async updateTag(tagId, tagData) {
    withStoredData((data) => {
      const nextTags = data.tags.map((tag) => (
        tag.id === tagId
          ? {
              ...tag,
              ...tagData,
              id: tag.id
            }
          : tag
      ));

      const updatedTag = nextTags.find((tag) => tag.id === tagId);

      return {
        ...data,
        tags: nextTags,
        users: updatedTag ? syncUserTagsWithTag(updatedTag, data.users) : data.users
      };
    });
  }

  static async deleteTag(tagId) {
    withStoredData((data) => ({
      ...data,
      tags: data.tags.filter((tag) => tag.id !== tagId),
      users: data.users.map((user) => ({
        ...user,
        tags: user.tags.filter((tag) => tag.id !== tagId)
      }))
    }));
  }

  static async getUserTags(userId) {
    const data = await this.initializeData();
    const user = data.users.find((item) => item.id === userId);
    return user ? user.tags : [];
  }

  static async updateUserTags(userId, tagIds) {
    withStoredData((data) => {
      const tagsById = new Map(data.tags.map((tag) => [tag.id, tag]));

      return {
        ...data,
        users: data.users.map((user) => {
          if (user.id !== userId) {
            return user;
          }

          const currentAssignedDates = new Map(user.tags.map((tag) => [tag.id, tag.assignedDate]));

          return {
            ...user,
            tags: tagIds
              .map((tagId) => tagsById.get(tagId))
              .filter(Boolean)
              .map((tag) => ({
                ...tag,
                assignedDate: currentAssignedDates.get(tag.id) || new Date().toISOString().split('T')[0]
              }))
          };
        })
      };
    });
  }
}

export default SimpleDatabaseService;
