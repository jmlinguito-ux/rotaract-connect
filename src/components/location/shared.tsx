import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

export type LocationValue = {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
};

export type LocationPickerProps = {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  geofenceRadius?: number;
};

/** District 3800 default location centroid — starts with empty address and city. */
export const DEFAULT_LOCATION: LocationValue = {
  latitude: 14.6500,
  longitude: 121.0800,
  address: '',
  city: '',
};

/**
 * Explicit list of cities/municipalities in Rotary District 3800:
 * - Zone 1: Malabon, Navotas
 * - Zone 2: Caloocan (North & South)
 * - Zone 3: Valenzuela
 * - Zone 4: Marikina
 * - Zone 5: Province of Rizal (Antipolo, Angono, Baras, Binangonan, Cainta, Cardona, Jalajala, Morong, Pililla, Rodriguez/Montalban, San Mateo, Tanay, Taytay, Teresa)
 * - Zone 6: Pasig
 * - Zone 7: San Juan
 * - Zone 8: Mandaluyong
 */
export const DISTRICT_3800_INCLUDED_CITIES = [
  'valenzuela',
  'caloocan',
  'malabon',
  'navotas',
  'marikina',
  'pasig',
  'mandaluyong',
  'san juan',
  'antipolo',
  'angono',
  'baras',
  'binangonan',
  'cainta',
  'cardona',
  'jalajala',
  'morong',
  'pililla',
  'rodriguez',
  'montalban',
  'san mateo',
  'tanay',
  'taytay',
  'teresa',
  'rizal',
];

/**
 * Cities explicitly OUTSIDE District 3800 (e.g. Makati, Taguig, Manila, QC, Pasay).
 */
export const EXCLUDED_NON_D3800_CITIES = [
  'makati',
  'taguig',
  'pasay',
  'parañaque',
  'paranaque',
  'las piñas',
  'las pinas',
  'muntinlupa',
  'pateros',
  'manila',
  'quezon city',
  'quezon',
  'cavite',
  'bulacan',
  'laguna',
  'batangas',
  'pampanga',
];

export function getDistrict3800Status(loc: { latitude: number; longitude: number; address?: string; city?: string }): {
  isD3800: boolean;
  badgeText: string;
} {
  const fullText = `${loc.address || ''} ${loc.city || ''}`.toLowerCase();

  // 1. Explicit exclusion check
  for (const excluded of EXCLUDED_NON_D3800_CITIES) {
    if (fullText.includes(excluded)) {
      const capName = excluded.charAt(0).toUpperCase() + excluded.slice(1);
      return {
        isD3800: false,
        badgeText: `Outside District 3800 (${capName})`,
      };
    }
  }

  // 2. Explicit inclusion check
  for (const included of DISTRICT_3800_INCLUDED_CITIES) {
    if (fullText.includes(included)) {
      const capCity = included.charAt(0).toUpperCase() + included.slice(1);
      return {
        isD3800: true,
        badgeText: `District 3800 Venue (${capCity})`,
      };
    }
  }

  // 3. Fallback coordinate check with strict D3800 bounding zones
  const lat = loc.latitude;
  const lng = loc.longitude;

  // Makati & Taguig & Pasay & South Metro (lat <= 14.565 and lng <= 121.07) are NOT in District 3800
  const inSouthMetro = lat <= 14.565 && lng <= 121.07;
  if (inSouthMetro) {
    return {
      isD3800: false,
      badgeText: 'Outside District 3800 (South Metro)',
    };
  }

  const inCamanava = lat >= 14.63 && lat <= 14.78 && lng >= 120.93 && lng <= 121.06;
  const inCentralD3800 = lat >= 14.57 && lat <= 14.68 && lng >= 121.02 && lng <= 121.13;
  const inRizal = lat >= 14.40 && lat <= 14.78 && lng >= 121.11 && lng <= 121.42;

  if (inCamanava || inCentralD3800 || inRizal) {
    return {
      isD3800: true,
      badgeText: 'District 3800 Venue',
    };
  }

  return {
    isD3800: false,
    badgeText: 'Outside District 3800',
  };
}

export function isDistrict3800Region(lat: number, lng: number, city?: string): boolean {
  return getDistrict3800Status({ latitude: lat, longitude: lng, city }).isD3800;
}

/**
 * Confirms what the venue search (or map pin) resolved to. Address and city are
 * filled from that selection rather than typed, so they're shown, not edited.
 */
export function LocationSummary({ value }: { value: LocationValue }) {
  const { colors: themeColors, isNightMode } = useTheme();
  if (!value.address && !value.city) return null;

  const status = getDistrict3800Status(value);

  return (
    <View style={[styles.summary, { backgroundColor: themeColors.primary + '10', borderColor: themeColors.primary + '2E' }]}>
      <Ionicons name="location" size={14} color={themeColors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.summaryTitle, { color: themeColors.text }]} numberOfLines={2}>
          {[value.address, value.city].filter(Boolean).join(', ')}
        </Text>
        <Text style={[styles.coordsText, { color: themeColors.textMuted }]}>
          {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
        </Text>
        <View style={styles.territoryRow}>
          <View style={[
            styles.territoryBadge,
            { backgroundColor: status.isD3800 ? (isNightMode ? '#064E3B' : '#EBF9F3') : (isNightMode ? '#451A03' : '#FFF4E5') }
          ]}>
            <Ionicons
              name={status.isD3800 ? 'shield-checkmark' : 'alert-circle-outline'}
              size={12}
              color={status.isD3800 ? themeColors.success : themeColors.warning}
            />
            <Text style={[styles.territoryBadgeText, { color: status.isD3800 ? themeColors.success : (isNightMode ? '#FDE68A' : '#B45309') }]}>
              {status.badgeText}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryTitle: { fontSize: 13, fontWeight: '600' },
  coordsText: { fontSize: 11, fontVariant: ['tabular-nums'], marginTop: 2 },
  territoryRow: { marginTop: 6, flexDirection: 'row' },
  territoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  territoryBadgeText: { fontSize: 10, fontWeight: '700' },

  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  searchInput: { flex: 1 },
  searchSpinner: { position: 'absolute', right: 14 },
  suggestions: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  suggestionDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  suggestionTitle: { fontSize: 14, fontWeight: '600' },
  suggestionSub: { fontSize: 11, marginTop: 1 },
  hint: { fontSize: 12, marginTop: 6 },
  error: { fontSize: 12, marginTop: 6 },
  mapWrap: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    borderWidth: 1,
    backgroundColor: '#E8EEF5',
  },
  mapHint: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  mapHintText: { fontSize: 11, fontWeight: '700', color: '#1A1A1A' },
});
