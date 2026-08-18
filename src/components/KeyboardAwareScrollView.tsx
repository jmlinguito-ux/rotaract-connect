import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Dimensions, Keyboard, NativeScrollEvent, NativeSyntheticEvent,
  Platform, ScrollView, ScrollViewProps, TextInput,
} from 'react-native';

/**
 * A drop-in ScrollView that keeps the focused text input visible above the
 * keyboard. Built for this app's Android edge-to-edge setup, where the window no
 * longer resizes when the keyboard opens (so `KeyboardAvoidingView` and
 * `adjustResize` are both no-ops) — see the `android-edge-to-edge-keyboard` note.
 *
 * How it works, without relying on any native resize:
 *   1. Listens for the keyboard and reserves bottom padding equal to its real
 *      height, so there is always room to scroll.
 *   2. Measures the CURRENTLY FOCUSED input in window coordinates and, if it sits
 *      under the keyboard, scrolls just enough to lift it above — correct for a
 *      field anywhere in the form, not only the last one.
 *
 * Scrolling on keyboard-show covers opening the keyboard on any field. For moving
 * between fields while the keyboard is already open (no new show event fires),
 * add `onFocus={() => ref.current?.scrollFocusedIntoView()}` to those inputs, or
 * use the exported `useKeyboardAwareFocus()` helper.
 */

export interface KeyboardAwareScrollHandle {
  /** Scrolls the currently focused input above the keyboard (call from onFocus). */
  scrollFocusedIntoView: () => void;
  /** The underlying ScrollView, for scrollTo/scrollToEnd if needed. */
  getScrollView: () => ScrollView | null;
}

/**
 * Lets any input nested inside a KeyboardAwareScrollView opt into auto-scroll
 * without threading a ref down. `null` when there is no enclosing provider.
 */
const KeyboardAwareContext = React.createContext<(() => void) | null>(null);

interface Props extends ScrollViewProps {
  /** Gap (px) left between the focused input and the top of the keyboard. */
  keyboardTopMargin?: number;
}

export const KeyboardAwareScrollView = forwardRef<KeyboardAwareScrollHandle, Props>(
  function KeyboardAwareScrollView(
    { children, contentContainerStyle, onScroll, keyboardShouldPersistTaps = 'handled', keyboardTopMargin = 24, ...rest },
    ref,
  ) {
    const scrollRef = useRef<ScrollView>(null);
    const scrollY = useRef(0);
    const kbHeightRef = useRef(0);
    const [kbHeight, setKbHeight] = useState(0);

    const scrollFocusedIntoView = useCallback(() => {
      const kb = kbHeightRef.current;
      if (kb <= 0) return;
      const node: any = TextInput.State.currentlyFocusedInput?.();
      const sv = scrollRef.current;
      if (!node || !sv || typeof node.measureInWindow !== 'function') return;
      node.measureInWindow((_x: number, y: number, _w: number, h: number) => {
        const screenH = Dimensions.get('window').height;
        const keyboardTop = screenH - kb;
        const overlap = (y + h) - (keyboardTop - keyboardTopMargin);
        if (overlap > 0) {
          sv.scrollTo({ y: scrollY.current + overlap, animated: true });
        }
      });
    }, [keyboardTopMargin]);

    useImperativeHandle(ref, () => ({
      scrollFocusedIntoView,
      getScrollView: () => scrollRef.current,
    }), [scrollFocusedIntoView]);

    useEffect(() => {
      const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
      const showSub = Keyboard.addListener(showEvt, e => {
        const kb = e?.endCoordinates?.height ?? 0;
        kbHeightRef.current = kb;
        setKbHeight(kb);
        // Let the padding apply + layout settle before measuring/scrolling.
        setTimeout(scrollFocusedIntoView, 80);
      });
      const hideSub = Keyboard.addListener(hideEvt, () => {
        kbHeightRef.current = 0;
        setKbHeight(0);
      });
      return () => { showSub.remove(); hideSub.remove(); };
    }, [scrollFocusedIntoView]);

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    };

    return (
      <KeyboardAwareContext.Provider value={scrollFocusedIntoView}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          contentContainerStyle={[contentContainerStyle, kbHeight ? { paddingBottom: kbHeight + keyboardTopMargin } : null]}
          {...rest}
        >
          {children}
        </ScrollView>
      </KeyboardAwareContext.Provider>
    );
  },
);

/**
 * Convenience for wiring field-to-field scrolling: returns an `onFocus` handler
 * that lifts the focused input above the keyboard.
 *
 *   const kav = useRef<KeyboardAwareScrollHandle>(null);
 *   const onFocus = useKeyboardAwareFocus(kav);
 *   <TextInput onFocus={onFocus} />
 */
export function useKeyboardAwareFocus(ref: React.RefObject<KeyboardAwareScrollHandle | null>) {
  return useCallback(() => {
    // Small delay so a field tapped while the keyboard is already open still
    // measures against a settled layout.
    setTimeout(() => ref.current?.scrollFocusedIntoView(), 50);
  }, [ref]);
}

/**
 * Returns an `onFocus` handler that lifts the focused input above the keyboard,
 * resolved from the nearest enclosing KeyboardAwareScrollView via context — so
 * shared input wrappers (e.g. a <Field/>) get the behavior with no ref wiring.
 * A no-op when there is no enclosing KeyboardAwareScrollView.
 */
export function useKeyboardAwareOnFocus() {
  const scrollFocused = React.useContext(KeyboardAwareContext);
  return useCallback(() => {
    if (scrollFocused) setTimeout(scrollFocused, 50);
  }, [scrollFocused]);
}
