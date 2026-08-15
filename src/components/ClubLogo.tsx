import React from 'react';
import { View, Image, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface Props {
  /** Diameter of the circular logo container. */
  size?: number;
  /** Override the background colour (defaults to theme primary). */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** Rotary wheel mark used as the club icon throughout the app. */
export default function ClubLogo({ size = 48, backgroundColor, style }: Props) {
  const { colors } = useTheme();
  const bg = backgroundColor ?? colors.primary;
  const iconSize = size * 1.4;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 4,
          overflow: 'hidden',
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Image
        source={require('../../assets/rotaract-club-logo.png')}
        style={{ width: iconSize, height: iconSize, tintColor: '#fff' }}
        resizeMode="contain"
      />
    </View>
  );
}

