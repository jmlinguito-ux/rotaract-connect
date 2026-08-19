import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export type LocationValue = {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
};

export type LocationPickerProps = {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
};

/** Metro Manila — where a new pin starts before the organizer moves it. */
export const DEFAULT_LOCATION: LocationValue = {
  latitude: 14.5764,
  longitude: 121.0851,
  address: '',
  city: '',
};

export function isDistrict3800Region(lat: number, lng: number): boolean {
  // District 3800 approximate bounding box: Metro Manila and Rizal (lat 14.3 to 14.9, lng 120.9 to 121.5)
  return lat >= 14.3 && lat <= 14.9 && lng >= 120.9 && lng <= 121.5;
}

/**
 * Confirms what the venue search (or map pin) resolved to. Address and city are
 * filled from that selection rather than typed, so they're shown, not edited.
 */
export function LocationSummary({ value }: { value: LocationValue }) {
  if (!value.address && !value.city) return null;

  const isD3800 = isDistrict3800Region(value.latitude, value.longitude);

  return (
    <View style={styles.summary}>
      <Ionicons name="location" size={14} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.summaryTitle} numberOfLines={2}>
          {[value.address, value.city].filter(Boolean).join(', ')}
        </Text>
        <Text style={styles.coordsText}>
          {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
        </Text>
        <View style={styles.territoryRow}>
          <View style={[styles.territoryBadge, { backgroundColor: isD3800 ? '#EBF9F3' : '#FFF4E5' }]}>
            <Ionicons name={isD3800 ? 'shield-checkmark' : 'globe-outline'} size={11} color={isD3800 ? '#10B981' : '#F59E0B'} />
            <Text style={[styles.territoryBadgeText, { color: isD3800 ? '#10B981' : '#F59E0B' }]}>
              {isD3800 ? 'District 3800 Venue (NCR / Rizal)' : 'Out-of-District Venue (500m Check-In Window)'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '2E',
  },
  summaryTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  coordsText: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'], marginTop: 2 },
  territoryRow: { marginTop: 6, flexDirection: 'row' },
  territoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  territoryBadgeText: { fontSize: 10, fontWeight: '700' },

  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1 },
  searchSpinner: { position: 'absolute', right: 14 },
  suggestions: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  suggestionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  suggestionTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  suggestionSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
  error: { fontSize: 12, color: colors.danger, marginTop: 6 },
  mapWrap: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#E8EEF5',
  },
  mapHint: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  mapHintText: { fontSize: 11, fontWeight: '600', color: colors.text },
});
