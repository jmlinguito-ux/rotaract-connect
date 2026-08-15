import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { RoleBadge } from '../utils/roles';
import RotaryWheel from './RotaryWheel';

interface Props {
  badge: RoleBadge;
  size: number;
  color?: string;
}

/** Renders a role badge's glyph from whichever icon set it belongs to. */
export default function RoleBadgeIcon({ badge, size, color }: Props) {
  const tint = color ?? badge.color;
  if (badge.family === 'rotary') {
    return <RotaryWheel size={size} color={tint} />;
  }
  return <Ionicons name={badge.icon as any} size={size} color={tint} />;
}
