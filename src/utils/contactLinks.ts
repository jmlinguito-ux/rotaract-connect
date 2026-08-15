import { Alert, Linking, Platform } from 'react-native';

/**
 * Phone numbers are entered with display spacing ("+63 917 123 4567"), which is
 * not valid inside a `tel:` URL — iOS silently rejects the whole link. Keep the
 * digits plus a leading "+" and drop everything else.
 */
function toDialableNumber(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? '+' + digits.slice(1).replace(/\+/g, '') : digits;
}

async function open(url: string, failureTitle: string, failureBody: string) {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(failureTitle, failureBody);
  }
}

/** Opens the system dialer with the number pre-filled. */
export function callNumber(raw?: string) {
  const number = toDialableNumber(raw ?? '');
  if (!number) return;
  // Android's `tel:` opens the dialer pre-filled; iOS shows a call confirmation.
  open(
    `tel:${number}`,
    'Cannot Place Call',
    Platform.OS === 'web'
      ? `Calling is not available here. The number is ${raw}.`
      : `No dialer app is available on this device. The number is ${raw}.`,
  );
}

/**
 * Opens the device's default maps app pinned at the venue. Uses the coordinates
 * (with the address as the pin label) so the pin lands on the exact spot rather
 * than a fuzzy text search: Apple Maps on iOS, the geo: scheme on Android, and
 * Google Maps in the browser on web.
 */
export function openMaps(latitude?: number, longitude?: number, label?: string) {
  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number';
  const name = encodeURIComponent(label ?? 'Venue');
  let url: string;
  if (Platform.OS === 'ios' && hasCoords) {
    url = `maps://?ll=${latitude},${longitude}&q=${name}`;
  } else if (Platform.OS === 'android' && hasCoords) {
    url = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${name})`;
  } else if (hasCoords) {
    url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  } else if (label) {
    url = `https://www.google.com/maps/search/?api=1&query=${name}`;
  } else {
    return;
  }
  open(
    url,
    'Cannot Open Maps',
    `No maps app is available on this device.${label ? ` The venue is ${label}.` : ''}`,
  );
}

/** Opens the default mail app with a new message to this address. */
export function sendEmail(address?: string, subject?: string) {
  const to = (address ?? '').trim();
  if (!to) return;
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  open(
    `mailto:${to}${query}`,
    'Cannot Open Mail App',
    `No email app is set up on this device. The address is ${to}.`,
  );
}
