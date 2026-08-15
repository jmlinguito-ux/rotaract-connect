import React from 'react';
import { Image, StyleProp, ImageStyle } from 'react-native';

interface Props {
  size?: number;
  /** Tints the mark; leave unset to use it as-is. */
  color?: string;
  style?: StyleProp<ImageStyle>;
}

/**
 * The Rotaract logo mark.
 */
export default function RotaryWheel({ size = 16, color, style }: Props) {
  return (
    <Image
      source={require('../../assets/rotaract-logo.webp')}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      tintColor={color}
    />
  );
}
