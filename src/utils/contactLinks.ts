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
