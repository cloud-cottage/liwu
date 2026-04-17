// Database initialization script for CloudBase
import DatabaseService from './database.js';

class DatabaseInitializer {
  // Create database indexes for better performance
  static async createIndexes() {
    try {
      console.log('Creating database indexes...');
      
      // Note: CloudBase automatically creates indexes for common queries
      // Additional indexes can be created through the CloudBase console if needed
      
      console.log('Indexes creation completed');
    } catch (error) {
      console.error('Index creation failed:', error);
      throw error;
    }
  }
  
  // Verify database connection and permissions
  static async verifyConnection() {
    try {
      console.log('Verifying database connection...');
      
      // Test basic read operation
      const users = await DatabaseService.getUsers();
      console.log('Database connection verified successfully');
      
      return {
        connected: true,
        userCount: users.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Database connection failed:', error);
      return {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default DatabaseInitializer;
