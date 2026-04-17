// Data migration service from localStorage to database
import DatabaseService from './database.js';
import { seedDashboardDataIfEmpty } from './dashboardSeed.js';

class MigrationService {
  // Migrate all data from localStorage to database
  static async migrateFromLocalStorage() {
    try {
      console.log('Starting migration from localStorage to database...');
      
      // Check if database is already initialized
      const existingUsers = await DatabaseService.getUsers();
      const existingCategories = await DatabaseService.getTagCategories();
      
      if (existingUsers.length > 0 || existingCategories.length > 0) {
        console.log('Database already contains data. Skipping migration.');
        return;
      }
      
      // Get data from localStorage
      const storedUsers = localStorage.getItem('dashboardUsers');
      const storedTags = localStorage.getItem('dashboardTags');
      const storedCategories = localStorage.getItem('tagCategories');
      
      if (!storedUsers || !storedTags || !storedCategories) {
        console.log('No data found in localStorage. Initializing with mock data...');
        await seedDashboardDataIfEmpty();
        return;
      }
      
      // Parse localStorage data
      const users = JSON.parse(storedUsers);
      const tags = JSON.parse(storedTags);
      const categories = JSON.parse(storedCategories);
      
      console.log(`Found ${users.length} users, ${tags.length} tags, ${categories.length} categories`);
      
      // Create categories first
      const categoryMap = {};
      for (const category of categories) {
        const categoryId = await DatabaseService.createCategory({
          name: category.name,
          color: category.color
        });
        categoryMap[category.id] = categoryId;
        console.log(`Created category: ${category.name}`);
      }
      
      // Create tags
      const tagMap = {};
      for (const tag of tags) {
        const tagId = await DatabaseService.createTag({
          name: tag.name,
          category_id: categoryMap[tag.categoryId],
          start_date: tag.startDate,
          end_date: tag.endDate,
          color: tag.color
        });
        tagMap[tag.id] = tagId;
        console.log(`Created tag: ${tag.name}`);
      }
      
      // Create users
      const userMap = {};
      for (const user of users) {
        const userId = await DatabaseService.createUser({
          name: user.name,
          avatar: user.avatar,
          email: user.email,
          phone: user.phone,
          join_date: user.joinDate,
          last_active: user.lastActive,
          status: user.status,
          level: user.level,
          experience: user.experience,
          bio: user.bio,
          location: user.location,
          age: user.age
        });
        userMap[user.id] = userId;
        console.log(`Created user: ${user.name}`);
      }
      
      // Assign tags to users
      for (const user of users) {
        if (user.tags && user.tags.length > 0) {
          const tagIds = user.tags.map(tag => tagMap[tag.id]);
          await DatabaseService.updateUserTags(userMap[user.id], tagIds);
          console.log(`Assigned ${tagIds.length} tags to user: ${user.name}`);
        }
      }
      
      console.log('Migration completed successfully!');
      
      // Clear localStorage after successful migration
      localStorage.removeItem('dashboardUsers');
      localStorage.removeItem('dashboardTags');
      localStorage.removeItem('tagCategories');
      console.log('localStorage cleared after migration');
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
  }
  
  // Verify migration by comparing data counts
  static async verifyMigration() {
    try {
      const dbUsers = await DatabaseService.getUsers();
      const dbTags = await DatabaseService.getTags();
      const dbCategories = await DatabaseService.getTagCategories();
      
      console.log('Migration verification:');
      console.log(`Users: ${dbUsers.length}`);
      console.log(`Tags: ${dbTags.length}`);
      console.log(`Categories: ${dbCategories.length}`);
      
      return {
        users: dbUsers.length,
        tags: dbTags.length,
        categories: dbCategories.length
      };
    } catch (error) {
      console.error('Verification failed:', error);
      throw error;
    }
  }
  
  // Rollback migration (delete all data)
  static async rollbackMigration() {
    try {
      console.log('Rolling back migration...');
      
      // Delete all user tags
      await DatabaseService.getUsers().then(users => {
        for (const user of users) {
          DatabaseService.updateUserTags(user.id, []);
        }
      });
      
      // Delete all tags
      await DatabaseService.getTags().then(tags => {
        for (const tag of tags) {
          DatabaseService.deleteTag(tag.id);
        }
      });
      
      // Delete all categories
      await DatabaseService.getTagCategories().then(categories => {
        for (const category of categories) {
          DatabaseService.deleteCategory(category.id);
        }
      });
      
      // Delete all users
      await DatabaseService.getUsers().then(users => {
        for (const user of users) {
          DatabaseService.deleteUser(user.id);
        }
      });
      
      console.log('Rollback completed');
    } catch (error) {
      console.error('Rollback failed:', error);
      throw error;
    }
  }
}

export default MigrationService;
