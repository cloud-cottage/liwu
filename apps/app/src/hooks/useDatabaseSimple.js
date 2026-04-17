import { useState, useEffect } from 'react';
import SimpleDatabaseService from '../services/databaseSimple.js';

export const useDatabaseSimple = () => {
  const [users, setUsers] = useState([]);
  const [tags, setTags] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all data
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [usersData, tagsData, categoriesData] = await Promise.all([
        SimpleDatabaseService.getUsers(),
        SimpleDatabaseService.getTags(),
        SimpleDatabaseService.getTagCategories()
      ]);
      
      setUsers(usersData);
      setTags(tagsData);
      setCategories(categoriesData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // User operations
  const updateUser = async (userId, userData) => {
    try {
      await SimpleDatabaseService.updateUser(userId, userData);
      await loadData();
    } catch (err) {
      console.error('Error updating user:', err);
      setError(err.message);
      throw err;
    }
  };

  // Category operations
  const updateCategory = async (categoryUpdate) => {
    try {
      if (categoryUpdate.action === 'delete') {
        await SimpleDatabaseService.deleteCategory(categoryUpdate.id);
      } else {
        await SimpleDatabaseService.updateCategory(categoryUpdate.id, categoryUpdate);
      }
      await loadData();
    } catch (err) {
      console.error('Error updating category:', err);
      setError(err.message);
      throw err;
    }
  };

  const createCategory = async (categoryData) => {
    try {
      await SimpleDatabaseService.createCategory(categoryData);
      await loadData();
    } catch (err) {
      console.error('Error creating category:', err);
      setError(err.message);
      throw err;
    }
  };

  // Tag operations
  const updateTag = async (tagUpdate) => {
    try {
      if (tagUpdate.action === 'delete') {
        await SimpleDatabaseService.deleteTag(tagUpdate.id);
      } else {
        await SimpleDatabaseService.updateTag(tagUpdate.id, tagUpdate);
      }
      await loadData();
    } catch (err) {
      console.error('Error updating tag:', err);
      setError(err.message);
      throw err;
    }
  };

  const createTag = async (tagData) => {
    try {
      await SimpleDatabaseService.createTag(tagData);
      await loadData();
    } catch (err) {
      console.error('Error creating tag:', err);
      setError(err.message);
      throw err;
    }
  };

  // User tag operations
  const updateUserTags = async (userId, newTags) => {
    try {
      const tagIds = newTags.map(tag => tag.id);
      await SimpleDatabaseService.updateUserTags(userId, tagIds);
      await loadData();
    } catch (err) {
      console.error('Error updating user tags:', err);
      setError(err.message);
      throw err;
    }
  };

  const getUserTags = async (userId) => {
    try {
      return await SimpleDatabaseService.getUserTags(userId);
    } catch (err) {
      console.error('Error getting user tags:', err);
      setError(err.message);
      throw err;
    }
  };

  // Initialize on mount
  useEffect(() => {
    loadData();
  }, []);

  return {
    // Data
    users,
    tags,
    categories,
    loading,
    error,
    
    // Operations
    loadData,
    updateUser,
    updateCategory,
    createCategory,
    updateTag,
    createTag,
    updateUserTags,
    getUserTags,
    
    // Utility
    refresh: loadData
  };
};
