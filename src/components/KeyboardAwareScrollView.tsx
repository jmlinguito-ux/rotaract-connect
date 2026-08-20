import React, { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Dimensions,
  findNodeHandle,
  Keyboard,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  TextInput,
} from 'react-native';

export interface KeyboardAwareScrollHandle {
  /** Scrolls the currently focused input above the keyboard */
  scrollFocusedIntoView: () => void;
  /** The underlying ScrollView */
  getScrollView: () => ScrollView | null;
}

const KeyboardAwareContext = createContext<(() => void) | null>(null);

interface Props extends ScrollViewProps {
  /** Gap (px) left between the top of the viewport and the focused input */
  keyboardTopMargin?: number;
}

export const KeyboardAwareScrollView = forwardRef<KeyboardAwareScrollHandle, Props>(
  function KeyboardAwareScrollView(
    { children, contentContainerStyle, onScroll, keyboardShouldPersistTaps = 'handled', keyboardDismissMode = 'on-drag', keyboardTopMargin = 80, ...rest },
    ref,
  ) {
    const scrollRef = useRef<ScrollView>(null);
    const scrollY = useRef(0);
    const kbHeightRef = useRef(0);
    const [kbHeight, setKbHeight] = useState(0);
    const scrollTimerRef = useRef<any>(null);

    const performScroll = useCallback(() => {
      const sv = scrollRef.current;
      const node: any = TextInput.State.currentlyFocusedInput?.();
      if (!sv || !node) return;

      try {
        if (typeof node.measureInWindow === 'function') {
          node.measureInWindow((_x: number, winY: number, _w: number, winH: number) => {
            if (typeof winY !== 'number' || isNaN(winY) || typeof winH !== 'number' || isNaN(winH)) return;
            const screenH = Dimensions.get('window').height;
            const kb = kbHeightRef.current || 300;
            const keyboardTop = screenH - kb;
            const clearanceMargin = 28;
            const keyboardBoundary = keyboardTop - clearanceMargin;

            // 1. Is the bottom of the input cut off by or under the keyboard?
            const bottomOverlap = (winY + winH) - keyboardBoundary;
            if (bottomOverlap > 0) {
              sv.scrollTo({ y: Math.max(0, scrollY.current + bottomOverlap), animated: true });
              return;
            }

            // 2. Is the top of the input hidden under a top navigation bar (e.g. y < 70)?
            const topClearance = 70;
            if (winY < topClearance) {
              const topOverlap = topClearance - winY;
              sv.scrollTo({ y: Math.max(0, scrollY.current - topOverlap), animated: true });
            }
            // If the input is already comfortably visible between the top header and keyboard, DO NOTHING!
          });
        }
      } catch {
        // Safe swallow
      }
    }, []);

    const scrollFocusedIntoView = useCallback(() => {
      if (scrollTimerRef.current) {
        clearTimeout(scrollTimerRef.current);
      }
      scrollTimerRef.current = setTimeout(performScroll, Platform.OS === 'ios' ? 60 : 120);
    }, [performScroll]);

    useImperativeHandle(ref, () => ({
      scrollFocusedIntoView,
      getScrollView: () => scrollRef.current,
    }), [scrollFocusedIntoView]);

    useEffect(() => {
      const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

      const showSub = Keyboard.addListener(showEvt, e => {
        const h = e?.endCoordinates?.height ?? 0;
        setKbHeight(h);
        scrollFocusedIntoView();
      });

      const hideSub = Keyboard.addListener(hideEvt, () => {
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        setKbHeight(0);
      });

      return () => {
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        showSub.remove();
        hideSub.remove();
      };
    }, [scrollFocusedIntoView]);

    const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
      onScroll?.(e);
    };

    const flattened = StyleSheet.flatten(contentContainerStyle) || {};
    const basePaddingBottom = typeof flattened.paddingBottom === 'number' ? flattened.paddingBottom : 0;

    return (
      <KeyboardAwareContext.Provider value={scrollFocusedIntoView}>
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          scrollEventThrottle={16}
          onScroll={handleScroll}
          contentContainerStyle={[
            contentContainerStyle,
            kbHeight > 0 ? { paddingBottom: basePaddingBottom + kbHeight + 20 } : null,
          ]}
          {...rest}
        >
          {children}
        </ScrollView>
      </KeyboardAwareContext.Provider>
    );
  },
);

export function useKeyboardAwareFocus(ref: React.RefObject<KeyboardAwareScrollHandle | null>) {
  return useCallback(() => {
    ref.current?.scrollFocusedIntoView();
  }, [ref]);
}

export function useKeyboardAwareOnFocus() {
  const scrollFocused = useContext(KeyboardAwareContext);
  return useCallback(() => {
    if (scrollFocused) {
      scrollFocused();
    }
  }, [scrollFocused]);
}
