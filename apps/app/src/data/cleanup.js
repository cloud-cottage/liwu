// Cleanup script - Remove after data initialization
// Run this in browser console after initializing data

const cleanupMockDataFiles = () => {
  console.log('Cleaning up mock data files...');
  
  // This script should be run after data is initialized
  // It provides instructions for manual cleanup
  
  console.log('After running initializeDashboardData(), you can safely delete these files:');
  console.log('1. /src/data/mockUsers.js');
  console.log('2. /src/data/mockTags.js');
  console.log('3. /src/data/initData.js');
  console.log('4. /src/data/cleanup.js');
  
  console.log('The data will persist in localStorage and be loaded by the Dashboard component.');
  console.log('Dashboard component will automatically use localStorage data if available.');
  
  // Alternative: Clear localStorage if needed
  window.clearDashboardData = () => {
    localStorage.removeItem('dashboardUsers');
    localStorage.removeItem('dashboardTags');
    localStorage.removeItem('tagCategories');
    console.log('Dashboard data cleared from localStorage');
  };
  
  console.log('Data clearing function available as: clearDashboardData()');
};

if (typeof window !== 'undefined') {
  window.cleanupMockDataFiles = cleanupMockDataFiles;
  console.log('Cleanup instructions available as: cleanupMockDataFiles()');
}

export { cleanupMockDataFiles };
