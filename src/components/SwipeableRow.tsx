import React, { useRef } from 'react';
import { View, Animated, PanResponder, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface SwipeAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Background color of the action button. */
  color: string;
  onPress: () => void;
  /** When true, the row animates off-screen before firing (used for destructive actions). */
  destructive?: boolean;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  /** Back-compat shorthand: a single red Delete action. Ignored when `actions` is set. */
  onDelete?: () => void;
  /** Ordered right-side actions revealed on swipe (left = first). */
  actions?: SwipeAction[];
  /** Optional swipe-right gesture to trigger reply on chat messages. */
  onReply?: () => void;
}

const ACTION_WIDTH = 76;

/**
 * Horizontal swipe-to-reveal row actions, built on PanResponder (no reanimated
 * dependency). Supports right-side actions on left swipe and instant reply on right swipe;
 * opening snaps to fit them and only horizontal gestures are captured, so vertical scrolling
 * and taps on the row content are unaffected.
 */
export function SwipeableRow({ children, onDelete, actions, onReply }: SwipeableRowProps) {
  const resolvedActions: SwipeAction[] = actions && actions.length
    ? actions
    : onDelete
      ? [{ key: 'delete', label: 'Delete', icon: 'trash-outline', color: '#EF4444', onPress: onDelete, destructive: true }]
      : [];

  const openWidth = Math.max(resolvedActions.length * ACTION_WIDTH, ACTION_WIDTH);
  const pan = useRef(new Animated.ValueXY()).current;
  const isOpen = useRef(false);

  const close = () => {
    isOpen.current = false;
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, bounciness: 4 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < 12,
      onPanResponderMove: (_, g) => {
        const startX = isOpen.current ? -openWidth : 0;
        const newX = startX + g.dx;
        const minX = resolvedActions.length > 0 ? -openWidth - 40 : 0;
        const maxX = onReply ? 64 : 0;
        pan.setValue({ x: Math.min(maxX, Math.max(minX, newX)), y: 0 });
      },
      onPanResponderRelease: (_, g) => {
        if (onReply && g.dx > 36) {
          close();
          onReply();
        } else if (resolvedActions.length > 0 && (g.dx < -40 || (isOpen.current && g.dx < 20))) {
          isOpen.current = true;
          Animated.spring(pan, { toValue: { x: -openWidth, y: 0 }, useNativeDriver: false, bounciness: 4 }).start();
        } else {
          close();
        }
      },
    })
  ).current;

  const runAction = (action: SwipeAction) => {
    if (action.destructive) {
      Animated.timing(pan, { toValue: { x: -500, y: 0 }, duration: 200, useNativeDriver: false })
        .start(() => action.onPress());
    } else {
      close();
      action.onPress();
    }
  };

  const safeMin = -Math.max(openWidth * 0.6, 24);
  const actionsOpacity = pan.x.interpolate({
    inputRange: [safeMin, -12, 0],
    outputRange: [1, 0.2, 0],
    extrapolate: 'clamp',
  });

  const replyScale = onReply ? pan.x.interpolate({
    inputRange: [0, 20, 50],
    outputRange: [0.5, 0.8, 1.15],
    extrapolate: 'clamp',
  }) : 0;

  const replyOpacity = onReply ? pan.x.interpolate({
    inputRange: [0, 15, 36],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  }) : 0;

  if (resolvedActions.length === 0 && !onReply) return <>{children}</>;

  return (
    <View style={styles.container}>
      {resolvedActions.length > 0 && (
        <Animated.View style={[styles.actionsBackground, { width: openWidth, opacity: actionsOpacity }]}>
          {resolvedActions.map(action => (
            <TouchableOpacity
              key={action.key}
              style={[styles.actionBtn, { backgroundColor: action.color, width: ACTION_WIDTH }]}
              onPress={() => runAction(action)}
              activeOpacity={0.85}
            >
              <Ionicons name={action.icon} size={18} color="#fff" />
              <Text style={styles.actionText}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {onReply && (
        <Animated.View style={[styles.replyBackground, { opacity: replyOpacity, transform: [{ scale: replyScale }] }]}>
          <View style={styles.replyCircle}>
            <Ionicons name="arrow-undo" size={16} color="#fff" />
          </View>
        </Animated.View>
      )}

      <Animated.View
        style={[{ transform: pan.getTranslateTransform(), zIndex: 1, backgroundColor: 'transparent' }]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Owns the inter-row spacing so the swiped child card carries no bottom margin
  // of its own — that keeps the revealed action buttons exactly the card's height.
  container: { position: 'relative', marginBottom: 8, borderRadius: 12, overflow: 'hidden' },
  actionsBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 0,
  },
  actionBtn: { height: '100%', justifyContent: 'center', alignItems: 'center', gap: 2 },
  actionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  replyBackground: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  replyCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});
