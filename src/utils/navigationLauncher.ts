import { Linking, Platform, Alert } from 'react-native';

/**
 * Launches the device's native navigation application (Apple Maps on iOS,
 * Google Maps on Android) with a fallback to Google Maps in the browser.
 */
export async function openNavigationApp(
  latitude: number,
  longitude: number,
  label: string,
  address?: string,
): Promise<void> {
  const encodedLabel = encodeURIComponent(label || address || 'Event Venue');
  const encodedAddress = encodeURIComponent(address || `${latitude},${longitude}`);

  let nativeUrl = '';
  let webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  if (Platform.OS === 'ios') {
    nativeUrl = `maps:0,0?q=${encodedLabel}@${latitude},${longitude}`;
    webUrl = `https://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d&q=${encodedLabel}`;
  } else if (Platform.OS === 'android') {
    nativeUrl = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodedLabel})`;
  }

  try {
    const supported = nativeUrl ? await Linking.canOpenURL(nativeUrl) : false;
    if (supported) {
      await Linking.openURL(nativeUrl);
    } else {
      await Linking.openURL(webUrl);
    }
  } catch (err) {
    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert('Navigation Error', 'Unable to launch map application.');
    }
  }
}
