import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, KeyboardEvent, LayoutAnimation, Platform } from 'react-native';

/**
 * Matches the next layout pass to the keyboard's own animation curve.
 *
 * iOS only, and deliberately so. `KeyboardAvoidingView` used to animate the lift
 * natively; driving the offset from state instead would otherwise snap it in a
 * single frame. iOS hands us the real `duration`/`easing` on `keyboardWillShow`,
 * so we replay them and the composer glides with the keyboard.
 *
 * Not applied on Android: `keyboardDidShow` fires only AFTER the keyboard has
 * finished animating (there is nothing left to sync to), and LayoutAnimation is
 * unreliable under Fabric there.
 */
function animateWithKeyboard(e?: KeyboardEvent) {
  if (Platform.OS !== 'ios') return;
  const duration = e?.duration ?? 250;
  if (duration <= 0) return;
  LayoutAnimation.configureNext({
    duration,
    update: {
      // iOS keyboard curves map to `keyboard` — LayoutAnimation understands it.
      type: (LayoutAnimation.Types as any).keyboard ?? LayoutAnimation.Types.easeInEaseOut,
    },
  });
}

/**
 * Distance (dp) from the BOTTOM OF THE SCREEN to the TOP OF THE KEYBOARD.
 * Returns 0 while the keyboard is hidden.
 *
 * Why not `endCoordinates.height`?
 * -------------------------------
 * This app runs edge-to-edge (`edgeToEdgeEnabled=true`), so `adjustResize` is
 * ignored, `KeyboardAvoidingView` is inert, and the root view spans the FULL
 * screen — including the strip behind the navigation bar.
 *
 * On this hardware Android reports `screenY: 541.45, height: 284` on a 872.7dp
 * screen: 541.45 + 284 = 825.45, which is the top of the navigation bar, NOT the
 * bottom of the screen. Padding a bottom-anchored bar by `height` therefore
 * leaves it ~47dp (one navigation bar) too low and still under the keyboard.
 *
 * Measuring from the screen bottom to the keyboard top is exact on both
 * platforms and independent of navigation mode (3-button vs gesture).
 */
export function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvt, e => {
      const end = e?.endCoordinates;
      if (!end) return;
      const screenH = Dimensions.get('screen').height;
      // Fall back to the raw height if screenY is unavailable for any reason.
      const next =
        typeof end.screenY === 'number' && screenH > 0
          ? Math.max(0, screenH - end.screenY)
          : end.height ?? 0;
      animateWithKeyboard(e);
      setOffset(next);
    });
    const hideSub = Keyboard.addListener(hideEvt, e => {
      animateWithKeyboard(e);
      setOffset(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return offset;
}
