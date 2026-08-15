import React from 'react';
import { RefreshControl } from 'react-native';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Themed pull-to-refresh control wired to DataContext.refresh, for use on any
 * scrollable screen (FlatList / ScrollView / SectionList). Dragging down past
 * the top re-pulls the full dataset from Supabase and reconciles local state —
 * the app has no realtime subscriptions, so this is how a user picks up changes
 * (roles, approvals, new events, notifications) made elsewhere.
 *
 *   const refreshControl = useAppRefreshControl();
 *   <FlatList ... refreshControl={refreshControl} />
 */
export function useAppRefreshControl() {
  const { refreshing, refresh } = useData();
  const { colors } = useTheme();
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={refresh}
      // iOS spinner + Android ring, kept on-brand.
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );
}
