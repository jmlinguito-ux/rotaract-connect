// Notification banner sound.
//
// Playing audio in React Native needs a native module (`expo-audio`) plus bundled
// sound assets and a dev-client rebuild — none of which can be added without a
// native build. So these are safe no-ops today; VIBRATION already works without
// them (short buzz for ALERT, long repeating buzz for HIGH until seen).
//
// TO ENABLE SOUND:
//   1) npx expo install expo-audio
//   2) add assets: assets/sounds/chime.mp3 (ALERT) and assets/sounds/alarm.mp3 (HIGH)
//   3) rebuild the dev client / EAS build
//   4) implement below, e.g. with createAudioPlayer from 'expo-audio':
//
//        import { createAudioPlayer, AudioPlayer } from 'expo-audio';
//        let player: AudioPlayer | null = null;
//        export function playAlertSound(priority: 'ALERT' | 'HIGH') {
//          stopAlertSound();
//          player = createAudioPlayer(
//            priority === 'HIGH'
//              ? require('../../assets/sounds/alarm.mp3')
//              : require('../../assets/sounds/chime.mp3'),
//          );
//          player.loop = priority === 'HIGH';   // HIGH loops until stopAlertSound()
//          player.play();
//        }
//        export function stopAlertSound() { player?.remove(); player = null; }

export function playAlertSound(_priority: 'ALERT' | 'HIGH') {
  // no-op until expo-audio is added (see notes above)
}

export function stopAlertSound() {
  // no-op until expo-audio is added (see notes above)
}
