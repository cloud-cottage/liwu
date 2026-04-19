import { useCallback, useEffect, useState } from 'react';
import { badgeService } from '../services/cloudbase';

const DEFAULT_BADGE_GROUPS = {
  growth: [],
  builder: []
};

export const useBadgeState = ({ autoLoad = true } = {}) => {
  const [loading, setLoading] = useState(autoLoad);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [badges, setBadges] = useState([]);
  const [groupedBadges, setGroupedBadges] = useState(DEFAULT_BADGE_GROUPS);
  const [badgeProfile, setBadgeProfile] = useState(null);

  const refresh = useCallback(async (options = {}) => {
    try {
      setLoading(true);
      setError('');

      const result = await badgeService.getCurrentUserBadgeState({
        refresh: options.refresh ?? true,
        allowAnonymous: options.allowAnonymous ?? true
      });

      setBadges(result.badges || []);
      setGroupedBadges(result.groupedBadges || DEFAULT_BADGE_GROUPS);
      setBadgeProfile(result.badgeProfile || null);
      return result;
    } catch (loadError) {
      console.error('加载徽章状态失败:', loadError);
      setError(loadError.message || '加载徽章状态失败');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const equipBadge = useCallback(async (badgeId) => {
    try {
      setSaving(true);
      setError('');

      const result = await badgeService.equipBadge(badgeId);
      setBadges(result.badges || []);
      setGroupedBadges(result.groupedBadges || DEFAULT_BADGE_GROUPS);
      setBadgeProfile(result.badgeProfile || null);
      return result;
    } catch (saveError) {
      console.error('佩戴徽章失败:', saveError);
      setError(saveError.message || '佩戴徽章失败');
      throw saveError;
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }

    void refresh();
  }, [autoLoad, refresh]);

  const equippedBadge = badges.find((badge) => badge.equipped) || null;

  return {
    loading,
    saving,
    error,
    badges,
    groupedBadges,
    badgeProfile,
    equippedBadge,
    refresh,
    equipBadge
  };
};

export default useBadgeState;
