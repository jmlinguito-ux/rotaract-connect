import React from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useKeyboardOffset } from './useKeyboardOffset';

interface AppModalKeyboardWrapperProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Additional vertical offset for iOS keyboard avoiding view */
  keyboardVerticalOffset?: number;
  /** When true, tapping outside modal content dismisses keyboard */
  dismissOnBackdropPress?: boolean;
}

/**
 * Standardized keyboard wrapper for Modal / Dialog components across iOS & Android.
 * - Dynamically toggles alignment between centered (idle) and top-aligned (when keyboard is open).
 * - Avoids header clipping, double-insets, and dialog truncation on iOS & Android.
 */
export default function AppModalKeyboardWrapper({
  children,
  contentContainerStyle,
  style,
  keyboardVerticalOffset = 0,
  dismissOnBackdropPress = true,
}: AppModalKeyboardWrapperProps) {
  const keyboardOffset = useKeyboardOffset();
  const isKeyboardVisible = keyboardOffset > 0;

  // On iOS `behavior="padding"` lifts the content correctly. On Android this app
  // runs edge-to-edge, where KeyboardAvoidingView is a no-op (the window never
  // resizes), so we instead reserve live keyboard-height padding at the bottom of
  // the scroll content and top-align it — that keeps the focused field visible.
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
      style={[styles.avoidView, style]}
    >
      <TouchableWithoutFeedback
        onPress={dismissOnBackdropPress ? Keyboard.dismiss : undefined}
        accessible={false}
      >
        <ScrollView
          contentContainerStyle={[
            styles.defaultContentContainer,
            contentContainerStyle,
            isKeyboardVisible && styles.keyboardOpenContentContainer,
            Platform.OS === 'android' && isKeyboardVisible
              ? { paddingBottom: keyboardOffset + 20 }
              : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
            {children as any}
          </TouchableWithoutFeedback>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  avoidView: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  defaultContentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  keyboardOpenContentContainer: {
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
});
