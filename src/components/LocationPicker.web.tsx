import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { LocationPickerProps, LocationSummary, styles } from './location/shared';
import { PlaceSearchField } from './location/PlaceSearchField';

/**
 * Place search works everywhere (it's a plain fetch), but react-native-maps has
 * no web build — so web gets the search and fields without the pin-drop map.
 * Metro resolves this file instead of LocationPicker.tsx for the web bundle.
 */
export function LocationPicker({ value, onChange }: LocationPickerProps) {
  return (
    <>
      <PlaceSearchField address={value.address} onSelect={onChange} />

      <View style={styles.mapWrap}>
        <View style={webNotice}>
          <Ionicons name="map-outline" size={22} color={colors.textMuted} />
          <Text style={styles.mapHintText}>Pin drop on the map is available on the mobile app</Text>
        </View>
      </View>

      <LocationSummary value={value} />
    </>
  );
}

const webNotice = {
  flex: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 8,
  padding: 16,
};
