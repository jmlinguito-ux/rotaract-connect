import React, { useEffect, useRef } from 'react';
import {
  TouchableOpacity,
  Animated,
  StyleSheet,
  ViewStyle,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

export interface AppSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  style?: ViewStyle;
  activeColor?: string;
  inactiveColor?: string;
  thumbColor?: string;
  size?: 'sm' | 'md';
}

/**
 * Premium custom animated switch component.
 * Replaces React Native's native <Switch> to eliminate Android Material 3
 * touch-halo clipping bugs and guarantee a consistent, polished look across all OS versions.
 */
export default function AppSwitch({
  value,
  onValueChange,
  disabled = false,
  style,
  activeColor,
  inactiveColor,
  thumbColor = '#FFFFFF',
  size = 'md',
}: AppSwitchProps) {
  const { colors: themeColors, isNightMode } = useTheme();

  const isSmall = size === 'sm';
  const trackWidth = isSmall ? 40 : 48;
  const trackHeight = isSmall ? 22 : 26;
  const thumbSize = isSmall ? 18 : 22;
  const padding = 2;
  const travelDistance = trackWidth - thumbSize - padding * 2;

  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      bounciness: 4,
      speed: 16,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const activeBg = activeColor || themeColors.primary;
  const inactiveBg = inactiveColor || (isNightMode ? '#334155' : '#E2E8F0');
  const inactiveBorder = isNightMode ? '#475569' : '#CBD5E1';

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveBg, activeBg],
  });

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveBorder, activeBg],
  });

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [padding, padding + travelDistance],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.touchable,
        { opacity: disabled ? 0.5 : 1 },
        style,
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: trackWidth,
            height: trackHeight,
            borderRadius: trackHeight / 2,
            backgroundColor,
            borderColor,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              backgroundColor: thumbColor,
              transform: [{ translateX }],
            },
          ]}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  track: {
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  thumb: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2.5,
      },
      android: {
        elevation: 2,
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
    }),
  },
});
