// Notification banner sounds (chime for ALERT, looping alarm for HIGH).
//
// Uses expo-audio. IMPORTANT: expo-audio is a NATIVE module, so it only works in a
// dev-client / EAS build that was compiled AFTER it was added. On an older build
// the native module is absent — every call here is wrapped so it safely no-ops
// (vibration still works) instead of crashing. Rebuild the app to hear sound.
//
//   npx expo run:android   (or)   eas build --profile development --platform android

import type { AudioPlayer } from 'expo-audio';

// Guarded require: bundles fine (package is installed) but tolerates the native
// module being missing on an older binary.
let audio: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  audio = require('expo-audio');
} catch {
  audio = null;
}

const CHIME = require('../../assets/sounds/chime.wav');
const ALERT = require('../../assets/sounds/alert.wav');
const ALARM = require('../../assets/sounds/alarm.wav');

let player: AudioPlayer | null = null;
let audioModeSet = false;

function ensureAudioMode() {
  if (!audio || audioModeSet) return;
  try {
    // Play even when the iOS ring switch is on silent — alerts should be audible.
    audio.setAudioModeAsync({ playsInSilentMode: true });
    audioModeSet = true;
  } catch {
    // ignore — older build without the native module
  }
}

/** Plays the notification chime (CHIME), organizer alert (ALERT), or looping alarm (HIGH). */
export function playAlertSound(priority: 'CHIME' | 'ALERT' | 'HIGH' = 'CHIME') {
  if (!audio?.createAudioPlayer) return;
  try {
    stopAlertSound();
    ensureAudioMode();
    const source = priority === 'HIGH' ? ALARM : priority === 'ALERT' ? ALERT : CHIME;
    player = audio.createAudioPlayer(source);
    if (player) {
      player.loop = priority === 'HIGH'; // HIGH keeps sounding until stopAlertSound()
      player.volume = 1.0;
      player.play();
    }
  } catch {
    // ignore playback errors (e.g. native module missing)
  }
}

/** Explicit helper for playing the pleasant chime sound */
export function playChimeSound() {
  playAlertSound('CHIME');
}

/** Stops and releases the current alert sound, if any. */
export function stopAlertSound() {
  try {
    player?.remove();
  } catch {
    // ignore
  }
  player = null;
}
