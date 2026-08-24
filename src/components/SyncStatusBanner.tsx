import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { getQueuedCheckInsCount, drainOfflineCheckIns } from '../services/offlineQueue';

export function SyncStatusBanner() {
  const { colors: themeColors, isNightMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [queueCount, setQueueCount] = useState(0);
  const [justSynced, setJustSynced] = useState(false);
  const [isDraining, setIsDraining] = useState(false);
  const translateY = useRef(new Animated.Value(-100)).current;
  const prevCount = useRef(0);

  const checkQueue = async () => {
    const count = await getQueuedCheckInsCount();
    if (prevCount.current > 0 && count === 0) {
      // Just drained completely
      setJustSynced(true);
      setTimeout(() => {
        setJustSynced(false);
      }, 3500);
    }
    prevCount.current = count;
    setQueueCount(count);
  };

  useEffect(() => {
    checkQueue();
    const interval = setInterval(checkQueue, 4000);
    return () => clearInterval(interval);
  }, []);

  const visible = queueCount > 0 || justSynced;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -100,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [visible]);

  const handleManualSync = async () => {
    setIsDraining(true);
    await drainOfflineCheckIns();
    await checkQueue();
    setIsDraining(false);
  };

  if (!visible && prevCount.current === 0 && !justSynced) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: Math.max(12, insets.top + 6),
          transform: [{ translateY }],
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View
        style={[
          styles.pill,
          justSynced
            ? [styles.pillSuccess, isNightMode && { backgroundColor: '#064E3B', borderColor: '#10B981' }]
            : [styles.pillWarning, isNightMode && { backgroundColor: '#78350F', borderColor: '#F59E0B' }],
        ]}
      >
        <Ionicons
          name={justSynced ? 'checkmark-circle' : 'cloud-offline'}
          size={16}
          color={justSynced ? (isNightMode ? '#6EE7B7' : '#065F46') : (isNightMode ? '#FDE68A' : '#92400E')}
        />
        <Text
          style={[
            styles.pillText,
            { color: justSynced ? (isNightMode ? '#6EE7B7' : '#065F46') : (isNightMode ? '#FDE68A' : '#92400E') },
          ]}
        >
          {justSynced
            ? 'All Check-Ins Synced'
            : `${queueCount} Check-In${queueCount === 1 ? '' : 's'} Queued (Offline)`}
        </Text>

        {!justSynced && (
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={handleManualSync}
            disabled={isDraining}
          >
            <Text style={styles.syncBtnText}>{isDraining ? 'Syncing…' : 'Sync'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
  pillWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  pillSuccess: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  syncBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 4,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
});
