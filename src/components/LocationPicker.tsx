import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import MapView, { MapPressEvent, Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { colors } from '../theme/colors';
import { LocationPickerProps, LocationSummary, styles } from './location/shared';
import { PlaceSearchField } from './location/PlaceSearchField';

/**
 * Two ways to set an event's location: search for a place and pick it from the
 * suggestions, or tap (or drag) the pin on the map. Either one back-fills the
 * other, so the address text and the coordinates stay in agreement.
 */
export function LocationPicker({ value, onChange, geofenceRadius = 300 }: LocationPickerProps) {
  const mapRef = useRef<MapView>(null);
  const isMapReady = useRef(false);

  // The map is uncontrolled so the organizer keeps whatever they've panned and
  // zoomed to. Only a *search* result should move it — a tap or drag already
  // put the pin where they wanted, so re-centering there would fight them.
  const pinnedByHand = useRef(false);

  useEffect(() => {
    if (pinnedByHand.current) {
      pinnedByHand.current = false;
      return;
    }
    if (isMapReady.current && mapRef.current && typeof value.latitude === 'number' && !isNaN(value.latitude) && typeof value.longitude === 'number' && !isNaN(value.longitude)) {
      try {
        mapRef.current.animateCamera(
          { center: { latitude: value.latitude, longitude: value.longitude } },
          { duration: 350 },
        );
      } catch (e) {
        console.warn('LocationPicker camera animation ignored:', e);
      }
    }
  }, [value.latitude, value.longitude]);

  /** Fill address/city from coordinates, keeping whatever we can't resolve. */
  const reverseFill = async (latitude: number, longitude: number) => {
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (!place) {
        onChange({ ...value, latitude, longitude });
        return;
      }
      const address = [place.name, place.street].filter(Boolean).join(', ');
      onChange({
        latitude,
        longitude,
        address: address || value.address,
        city: place.city || place.subregion || value.city,
      });
    } catch {
      // Reverse geocoding is best-effort — keep the coordinates the organizer chose.
      onChange({ ...value, latitude, longitude });
    }
  };

  const onMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    pinnedByHand.current = true;
    reverseFill(latitude, longitude);
  };

  return (
    <>
      <PlaceSearchField address={value.address} onSelect={onChange} />

      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={{
            latitude: value.latitude,
            longitude: value.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          onPress={onMapPress}
          onMapReady={() => {
            isMapReady.current = true;
          }}
        >
          {/* Geofence Perimeter Circle */}
          <Circle
            center={{ latitude: value.latitude, longitude: value.longitude }}
            radius={geofenceRadius}
            fillColor="rgba(212, 19, 103, 0.15)"
            strokeColor="#D41367"
            strokeWidth={2}
          />

          <Marker
            key={`picker_marker_${value.latitude}_${value.longitude}`}
            coordinate={{ latitude: value.latitude, longitude: value.longitude }}
            pinColor={colors.primary}
            draggable
            onDragEnd={e => {
              pinnedByHand.current = true;
              reverseFill(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
            }}
          />
        </MapView>
        <View style={styles.mapHint} pointerEvents="none">
          <Text style={styles.mapHintText}>Tap or drag pin · {geofenceRadius}m check-in perimeter</Text>
        </View>
      </View>

      <LocationSummary value={value} />
    </>
  );
}
