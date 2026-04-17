// Data initialization script - Run once and then delete
import { mockUsers } from './mockUsers.js';
import { mockTags, tagCategories, assignTagsToUsers } from './mockTags.js';

// Initialize data and store in localStorage
const initializeData = () => {
  console.log('Initializing dashboard data...');
  
  // Check if data already exists
  const existingUsers = localStorage.getItem('dashboardUsers');
  const existingTags = localStorage.getItem('dashboardTags');
  
  if (existingUsers && existingTags) {
    console.log('Data already exists. Skipping initialization.');
    return;
  }
  
  // Generate users with tags
  const usersWithTags = assignTagsToUsers(mockUsers, mockTags);
  
  // Store in localStorage
  localStorage.setItem('dashboardUsers', JSON.stringify(usersWithTags));
  localStorage.setItem('dashboardTags', JSON.stringify(mockTags));
  localStorage.setItem('tagCategories', JSON.stringify(tagCategories));
  
  console.log(`Initialized ${usersWithTags.length} users with ${mockTags.length} tags`);
  console.log('Data initialization complete!');
  
  // Log statistics
  const activeUsers = usersWithTags.filter(user => user.status === 'active').length;
  const usersWithTagsCount = usersWithTags.filter(user => user.tags.length > 0).length;
  const totalTagAssignments = usersWithTags.reduce((sum, user) => sum + user.tags.length, 0);
  
  console.log('Statistics:');
  console.log(`- Total users: ${usersWithTags.length}`);
  console.log(`- Active users: ${activeUsers}`);
  console.log(`- Users with tags: ${usersWithTagsCount}`);
  console.log(`- Total tag assignments: ${totalTagAssignments}`);
  console.log(`- Tag categories: ${tagCategories.length}`);
};

// Reset data function to clear old data and reinitialize
const resetDashboardData = () => {
  console.log('Resetting dashboard data...');
  
  // Clear existing data
  localStorage.removeItem('dashboardUsers');
  localStorage.removeItem('dashboardTags');
  localStorage.removeItem('tagCategories');
  
  console.log('Old data cleared. Reinitializing with auto-increment IDs...');
  
  // Initialize with new data
  initializeData();
  
  console.log('Dashboard data reset complete!');
};

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.initializeDashboardData = initializeData;
  window.resetDashboardData = resetDashboardData;
  console.log('Data initialization function available as: initializeDashboardData()');
  console.log('Data reset function available as: resetDashboardData()');
  console.log('Run resetDashboardData() to clear old data and reinitialize with auto-increment IDs.');
  console.log('After running, you can delete this file and the mock data files.');
}

// For Node.js usage
export { initializeData };
