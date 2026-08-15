import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RotaractEvent } from '../types';
import { colors } from '../theme/colors';
import { statusColor } from '../theme/statusColor';

/**
 * react-native-maps has no web implementation, so web keeps the schematic pin
 * canvas. Metro resolves this file instead of EventMap.tsx on web, which also
 * keeps the native map out of the web bundle entirely.
 */

export type EventMapProps = {
  events: RotaractEvent[];
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  onMarkerPress?: (eventId: string) => void;
};

const PIN_SIZE = 30;

function spreadPin(index: number, width: number, height: number): { top: number; left: number } {
  const cols = 3;
  const rows = 4;
  const pad = 24;
  // Clear the notice pill anchored at the top-left.
  const padTop = 52;
  const stepX = (width - pad * 2 - PIN_SIZE) / (cols - 1);
  const stepY = (height - padTop - pad - PIN_SIZE) / (rows - 1);
  return {
    left: pad + (index % cols) * stepX,
    top: padTop + (index % rows) * stepY,
  };
}

export function EventMap({ events, style, interactive = false, onMarkerPress }: EventMapProps) {
  const [canvas, setCanvas] = useState({ width: 0, height: 0 });

  return (
    <View
      style={[styles.canvas, style]}
      onLayout={e => setCanvas({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <View style={styles.webNotice}>
        <Ionicons name="map" size={14} color={colors.primary} />
        <Text style={styles.webNoticeText}>Map preview — run on a device for the live map</Text>
      </View>

      {canvas.width > 0 &&
        events.map((event, i) => {
          const { top, left } = spreadPin(i, canvas.width, canvas.height);
          const pinStyle = [styles.pin, { top, left, backgroundColor: statusColor(event.status) }];

          // The preview sits inside a button (tap to expand), so static pins
          // must not render as buttons themselves — nested buttons are
          // invalid HTML and React warns about them on web.
          if (!interactive) {
            return (
              <View key={event.id} style={pinStyle}>
                <Ionicons name="location" size={16} color="#fff" />
              </View>
            );
          }

          return (
            <TouchableOpacity
              key={event.id}
              style={pinStyle}
              onPress={() => onMarkerPress?.(event.id)}
              accessibilityRole="button"
              accessibilityLabel={event.title}
            >
              <Ionicons name="location" size={16} color="#fff" />
            </TouchableOpacity>
          );
        })}

      {events.length === 0 && <Text style={styles.empty}>No events match your filters.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, backgroundColor: '#E8EEF5', position: 'relative', overflow: 'hidden' },
  webNotice: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  webNoticeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  empty: { position: 'absolute', top: '50%', left: 0, right: 0, textAlign: 'center', color: colors.textMuted },
});
