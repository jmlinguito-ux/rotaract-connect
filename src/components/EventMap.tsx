import React, { useEffect, useMemo, useRef } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import MapView, { Marker, Circle, Region } from 'react-native-maps';
import { RotaractEvent } from '../types';
import { statusColor } from '../theme/statusColor';

import { distanceMeters, formatDistance } from '../utils/checkIn';
import { useTheme } from '../context/ThemeContext';
import { lightMapStyle, darkMapStyle } from '../theme/mapStyles';

// District 3800 covers Metro Manila and Rizal — used when no events are visible.
const FALLBACK_REGION: Region = {
  latitude: 14.5995,
  longitude: 120.9842,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
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
  const mapRef = useRef<MapView>(null);
  const isMapReady = useRef(false);
  const hasSize = useRef(false);
  const lastAnimated = useRef<Region | null>(null);
  // Once the user pans/zooms, stop auto-reframing so realtime data updates don't
  // yank the map out from under them.
  const userInteracted = useRef(false);
  const region = useMemo(() => regionFor(events, userCoords), [events, userCoords]);

  /**
   * Re-frame only on a real region change, and only once the map is both ready and
   * laid out with a non-zero frame. MKMapView raises an uncatchable NSException from
   * setRegion: when its bounds are empty — and because the command is dispatched to
   * the native main queue, a JS try/catch cannot intercept it. Prevention is the
   * only option.
   */
  useEffect(() => {
    if (!isMapReady.current || !hasSize.current || !mapRef.current) return;
    if (userInteracted.current) return;
    if (sameRegion(lastAnimated.current, region)) return;
    lastAnimated.current = region;
    mapRef.current.animateToRegion(region, 400);
  }, [region]);

  return (
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      initialRegion={region}
      userInterfaceStyle={isNightMode ? 'dark' : 'light'}
      customMapStyle={isNightMode ? darkMapStyle : lightMapStyle}
      // Pan + zoom work directly in the container now — no need to open fullscreen.
      scrollEnabled
      zoomEnabled
      rotateEnabled={interactive}
      pitchEnabled={interactive}
      toolbarEnabled={false}
      showsUserLocation={!!userCoords}
      showsMyLocationButton={!!userCoords}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        hasSize.current = width > 0 && height > 0;
      }}
      onMapReady={() => {
        isMapReady.current = true;
        // initialRegion already framed this; don't animate to it again.
        lastAnimated.current = region;
      }}
      onRegionChangeComplete={(_r, details) => {
        // `details.isGesture` is true only for user-driven changes (iOS/newer
        // Android); treat any user movement as opting out of auto-reframing.
        if (details?.isGesture) userInteracted.current = true;
      }}
    >
      {userCoords && (
        <Marker
          key="user_location_pin"
          coordinate={userCoords}
          pinColor="#007AFF"
          title="Your Current Location"
          description="You are currently located here"
        />
      )}

      {events
        .filter(e => e && typeof e.latitude === 'number' && !isNaN(e.latitude) && typeof e.longitude === 'number' && !isNaN(e.longitude))
        .map(event => {
          let distText = '';
          if (userCoords) {
            const d = distanceMeters(userCoords, { latitude: event.latitude, longitude: event.longitude });
            distText = `${formatDistance(d)} away • `;
          }

          const color = statusColor(event.status);
          return (
            <React.Fragment key={`event_group_${event.id}`}>
              {showAreas && (
                // Communicates an approximate area rather than a precise pinpoint.
                <Circle
                  key={`circle_${event.id}`}
                  center={{ latitude: event.latitude, longitude: event.longitude }}
                  radius={areaRadiusM}
                  strokeWidth={1}
                  strokeColor={color + '99'}
                  fillColor={color + '26'}
                />
              )}
              <Marker
                key={`marker_${event.id}`}
                coordinate={{ latitude: event.latitude, longitude: event.longitude }}
                pinColor={color}
                title={event.title}
                description={`${distText}${event.address}, ${event.city}`}
                onPress={() => onMarkerPress?.(event.id)}
              />
            </React.Fragment>
          );
        })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
