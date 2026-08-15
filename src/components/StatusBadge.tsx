import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { EventStatus } from '../types';
import { statusColor } from '../theme/statusColor';

export function StatusBadge({ status }: { status: EventStatus }) {
  const bg = statusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: bg + '22', borderColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: bg }]} />
      <Text style={[styles.text, { color: bg }]}>{status === 'PENDING_APPROVAL' ? 'PENDING APPROVAL' : status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
