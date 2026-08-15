import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { AppUser, UserRole } from '../types';
import { ROLE_BADGES } from '../utils/roles';
import RoleBadgeIcon from './RoleBadgeIcon';

interface Props {
  user: AppUser | { full_name: string; avatar_url?: string; role?: UserRole; verification_status?: string; position?: string };
  size?: number;
  showBadge?: boolean;
  /** Called with the photo URI when the avatar is tapped and the user has one. */
  onPressImage?: (imageUri: string) => void;
  /** Fallback tap handler used when there is no photo to open (e.g. pick one). */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function UserAvatar({ user, size = 48, showBadge = true, onPressImage, onPress, style }: Props) {
  const initials = user.full_name
    ? user.full_name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
    : 'RC';

  const avatarUri = user.avatar_url;

  // Officers whose title says President but whose role has not been set yet still
  // read as Presidents, matching how the rest of the app treats them.
  const impliedRole: UserRole | undefined = user.role
    ?? (user.position?.toLowerCase().includes('president') ? 'CLUB_PRESIDENT' : undefined);
  const badge = impliedRole ? ROLE_BADGES[impliedRole] : undefined;

  const badgeSize = Math.max(16, Math.round(size * 0.35));
  // The wheel is a ring mark, so it needs to fill more of the badge than a solid
  // glyph does before it reads as a wheel at list sizes.
  const iconSize = Math.max(9, Math.round(badgeSize * (badge?.family === 'rotary' ? 0.8 : 0.6)));

  const opensFullImage = !!avatarUri && !!onPressImage;

  const handlePress = () => {
    if (opensFullImage) {
      onPressImage!(avatarUri!);
      return;
    }
    onPress?.();
  };

  return (
    <TouchableOpacity
      // Without a handler of its own the avatar must not swallow taps meant for
      // the row it sits in.
      disabled={!opensFullImage && !onPress}
      activeOpacity={0.8}
      onPress={handlePress}
      style={[{ width: size, height: size, position: 'relative' }, style]}
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View style={[styles.initialsCircle, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.initialsText, { fontSize: Math.round(size * 0.4) }]}>{initials}</Text>
        </View>
      )}

      {showBadge && badge ? (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              backgroundColor: badge.color,
            },
          ]}
        >
          <RoleBadgeIcon badge={badge} size={iconSize} color="#FFF" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  initialsCircle: {
    backgroundColor: '#D41367',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    borderWidth: 1.5,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
