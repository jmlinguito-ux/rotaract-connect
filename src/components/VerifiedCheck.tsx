import React from 'react';
import { View, Text, StyleSheet, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface CheckProps {
  /** Anything with a verification_status; nothing renders unless it is VERIFIED. */
  user?: { verification_status?: string } | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The cranberry check shown beside a verified Rotaractor's name. Replaces the old
 * verified/unverified pills — unverified users simply get no mark.
 */
export default function VerifiedCheck({ user, size = 14, style }: CheckProps) {
  if (user?.verification_status !== 'VERIFIED') return null;
  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color={colors.primary}
      style={[styles.icon, style]}
    />
  );
}

interface NameProps {
  user?: { full_name?: string; verification_status?: string } | null;
  /** Falls back to this when the user record is missing a name. */
  name?: string;
  textStyle?: StyleProp<TextStyle>;
  checkSize?: number;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
}

/** Name followed by the verified check, laid out on one line. */
export function VerifiedName({ user, name, textStyle, checkSize = 14, numberOfLines, style }: NameProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={textStyle} numberOfLines={numberOfLines}>
        {user?.full_name ?? name ?? 'Unknown'}
      </Text>
      <VerifiedCheck user={user} size={checkSize} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  icon: { marginLeft: 0 },
});
