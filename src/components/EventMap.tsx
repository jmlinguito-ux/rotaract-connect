import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle, TouchableOpacity } from 'react-native';
import MapView, { Marker, Circle, Region } from 'react-native-maps';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RotaractEvent } from '../types';
import { statusColor } from '../theme/statusColor';

import { distanceMeters, formatDistance } from '../utils/checkIn';
import { useTheme } from '../context/ThemeContext';
import { lightMapStyle, darkMapStyle } from '../theme/mapStyles';

// District 3800 covers CAMANAVA (Valenzuela, Caloocan, Malabon, Navotas),
// Central Metro (Marikina, Pasig, Mandaluyong, San Juan), and Rizal Province.
const FALLBACK_REGION: Region = {
  latitude: 14.6500,
  longitude: 121.0800,
  latitudeDelta: 0.28,
  longitudeDelta: 0.28,
};

export function regionFor(events: RotaractEvent[], userCoords?: { latitude: number; longitude: number } | null): Region {
  const validEvents = (events || []).filter(e => e && typeof e.latitude === 'number' && !isNaN(e.latitude) && typeof e.longitude === 'number' && !isNaN(e.longitude));
  const lats = validEvents.map(e => e.latitude);
  const lngs = validEvents.map(e => e.longitude);

  if (userCoords && typeof userCoords.latitude === 'number' && !isNaN(userCoords.latitude) && typeof userCoords.longitude === 'number' && !isNaN(userCoords.longitude)) {
    lats.push(userCoords.latitude);
    lngs.push(userCoords.longitude);
  }

  if (lats.length === 0 || lngs.length === 0) return FALLBACK_REGION;

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latDelta = Math.max((maxLat - minLat) * 1.5, 0.05);
  const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.05);

  if (
    isNaN(centerLat) || isNaN(centerLng) || isNaN(latDelta) || isNaN(lngDelta) ||
    centerLat < -90 || centerLat > 90 || centerLng < -180 || centerLng > 180 ||
    latDelta <= 0 || latDelta > 180 || lngDelta <= 0 || lngDelta > 360
  ) {
    return FALLBACK_REGION;
  }

  return {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export type EventMapProps = {
  events: RotaractEvent[];
  userCoords?: { latitude: number; longitude: number } | null;
  style?: StyleProp<ViewStyle>;
  /** Fullscreen maps additionally allow rotate/pitch; pan + zoom work everywhere. */
  interactive?: boolean;
  /**
   * Draw an approximate-area circle around each event instead of implying an exact
   * pinpoint. Venue coordinates are often only approximate.
   */
  showAreas?: boolean;
  /** Radius in metres for the approximate-area circles. */
  areaRadiusM?: number;
  onMarkerPress?: (eventId: string) => void;
};

/** Regions are compared by value: object identity churns on every render. */
function sameRegion(a: Region | null, b: Region): boolean {
  if (!a) return false;
  const EPS = 1e-6;
  return (
    Math.abs(a.latitude - b.latitude) < EPS &&
    Math.abs(a.longitude - b.longitude) < EPS &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) < EPS &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) < EPS
  );
}

export function EventMap({ events, userCoords, style, interactive = false, showAreas = true, areaRadiusM = 400, onMarkerPress }: EventMapProps) {
  const { isNightMode } = useTheme();
  const isFocused = useIsFocused();
  const mapRef = useRef<MapView>(null);
  const isMapReady = useRef(false);
  const hasSize = useRef(false);
  const lastAnimated = useRef<Region | null>(null);
  // Once the user pans/zooms, stop auto-reframing so realtime data updates don't
  // yank the map out from under them.
  const userInteracted = useRef(false);
  const region = useMemo(() => regionFor(events, userCoords), [events, userCoords]);

  const [tracksView, setTracksView] = useState(true);

  const validEvents = useMemo(() => {
    return (events || []).filter(
      e => e && typeof e.latitude === 'number' && !isNaN(e.latitude) && typeof e.longitude === 'number' && !isNaN(e.longitude)
    );
  }, [events]);

  // Enable tracksViewChanges on mount or focus, then freeze after 800ms to guarantee stable rendering and zero CPU drain
  useEffect(() => {
    if (!isFocused) return;
    setTracksView(true);
    const t = setTimeout(() => setTracksView(false), 800);
    return () => clearTimeout(t);
  }, [isFocused, validEvents.length]);

  /**
   * Re-frame only on a real region change, and only once the map is both ready and
   * laid out with a non-zero frame.
   */
  useEffect(() => {
    if (!isMapReady.current || !hasSize.current || !mapRef.current) return;
    if (userInteracted.current) return;
    if (sameRegion(lastAnimated.current, region)) return;
    lastAnimated.current = region;
    mapRef.current.animateToRegion(region, 400);
  }, [region, isFocused]);

  // On Android, unmounting when out of focus and remounting on focus guarantees that
  // the native Google Maps surface and all child markers are freshly created,
  // preventing the native marker drop bug when switching back to this screen.
  if (Platform.OS === 'android' && !isFocused) {
    return <View style={[styles.map, style, { backgroundColor: isNightMode ? '#1E293B' : '#E2E8F0' }]} />;
  }

  const handleCenterUser = () => {
    if (!userCoords || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      },
      600,
    );
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        key={`event-map-${isNightMode ? 'dark' : 'light'}`}
        style={styles.map}
        initialRegion={region}
        userInterfaceStyle={isNightMode ? 'dark' : 'light'}
        customMapStyle={isNightMode ? darkMapStyle : lightMapStyle}
        showsUserLocation={false}
        showsMyLocationButton={false}
        onUserLocationChange={() => {}}
        showsCompass={interactive}
        scrollEnabled={true}
        zoomEnabled={true}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        onPanDrag={() => {
          userInteracted.current = true;
        }}
        onMapReady={() => {
          isMapReady.current = true;
          if (hasSize.current && mapRef.current && !userInteracted.current) {
            lastAnimated.current = region;
            mapRef.current.animateToRegion(region, 400);
          }
        }}
        onLayout={() => {
          hasSize.current = true;
          if (isMapReady.current && mapRef.current && !userInteracted.current) {
            lastAnimated.current = region;
            mapRef.current.animateToRegion(region, 400);
          }
        }}
        onRegionChangeComplete={(_r, details) => {
          if (details?.isGesture) userInteracted.current = true;
        }}
      >
      {/* Custom User Location Marker */}
      {userCoords && (
        <Marker
          key="user_location_marker"
          coordinate={userCoords}
          title="Your Current Location"
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
          zIndex={999}
        >
          <View style={styles.userDotOuter}>
            <View style={styles.userDotInner} />
          </View>
        </Marker>
      )}

      {showAreas &&
        validEvents.map(event => {
          const color = statusColor(event.status);
          return (
            <Circle
              key={`circle_${event.id}`}
              center={{ latitude: event.latitude, longitude: event.longitude }}
              radius={areaRadiusM}
              strokeWidth={1}
              strokeColor={color + '99'}
              fillColor={color + '26'}
            />
          );
        })}

      {validEvents.map(event => {
        let distText = '';
        if (userCoords) {
          const d = distanceMeters(userCoords, { latitude: event.latitude, longitude: event.longitude });
          distText = `${formatDistance(d)} away • `;
        }

        const color = statusColor(event.status);
        return (
          <Marker
            key={`marker_${event.id}`}
            coordinate={{ latitude: event.latitude, longitude: event.longitude }}
            title={event.title}
            description={`${distText}${event.address}, ${event.city}`}
            onPress={() => onMarkerPress?.(event.id)}
            tracksViewChanges={tracksView}
          >
            <View style={[styles.markerPin, { backgroundColor: color }]}>
              <Ionicons name="location" size={16} color="#fff" />
            </View>
          </Marker>
        );
      })}
      </MapView>

      {userCoords && (
        <TouchableOpacity
          style={[styles.locateBtn, { backgroundColor: isNightMode ? '#1E293B' : '#fff', borderColor: isNightMode ? '#334155' : '#E2E8F0' }]}
          onPress={handleCenterUser}
          accessibilityLabel="Center on my location"
        >
          <Ionicons name="locate" size={18} color="#0284C7" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  locateBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  markerPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  userDotOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(2, 132, 199, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDotInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0284C7',
    borderWidth: 2.5,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
});
