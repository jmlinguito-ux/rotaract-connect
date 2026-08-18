import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';

/**
 * Themed pull-to-refresh control wired to DataContext.refresh, for use on any
 * scrollable screen (FlatList / ScrollView / SectionList). Dragging down past
 * the top re-pulls the full dataset from Supabase and reconciles local state.
 *
 *   const refreshControl = useAppRefreshControl();
 *   <FlatList ... refreshControl={refreshControl} />
 *
 * `refreshing` is LOCAL to this hook instance, not shared across screens. This
 * is deliberate: if the flag were global, pulling on one tab would flip every
 * other tab's RefreshControl into `refreshing: true`, and iOS's UIRefreshControl
 * cannot cleanly end a refresh state it "inherited" (rather than being pulled to
 * trigger) — it would leave the spinner visible and the content offset shifted
 * down until the user manually scrolled. Making the flag local means only the
 * screen the user actually pulled on shows the spinner.
 *
 * The underlying `refresh()` in DataContext dedupes concurrent calls to a single
 * in-flight fetch and always resolves within a bounded time (10s AbortController
 * timeout), so this hook can safely await it without ever hanging.
 */
export function useAppRefreshControl() {
  const { refresh } = useData();
  const { colors } = useTheme();
  const primary = colors.primary;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  return useMemo(
    () => (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        // iOS spinner + Android ring, kept on-brand.
        tintColor={primary}
        colors={[primary]}
      />
    ),
    [refreshing, onRefresh, primary],
  );
}
