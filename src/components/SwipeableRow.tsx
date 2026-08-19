import React, { useRef } from 'react';
import { View, Animated, PanResponder, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
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
  /** Optional swipe-to-reply gesture for chat messages (swipe left). */
  onReply?: () => void;
}

const ACTION_WIDTH = 76;

/**
 * Horizontal swipe-to-reveal row actions, built on PanResponder (no reanimated
 * dependency). Supports right-side actions on left swipe and instant reply on left swipe
 * (WhatsApp/Telegram style); opening snaps to fit them and only horizontal gestures are captured,
 * avoiding vertical scrolling and iOS edge-back navigation conflicts.
 */
export function SwipeableRow({ children, onDelete, actions, onReply }: SwipeableRowProps) {
  const resolvedActions: SwipeAction[] = actions && actions.length
    ? actions
    : onDelete
      ? [{ key: 'delete', label: 'Delete', icon: 'trash-outline', color: '#EF4444', onPress: onDelete, destructive: true }]
      : [];

  const isReplyMode = !resolvedActions.length && !!onReply;
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
      onMoveShouldSetPanResponder: (_, g) => {
        return Math.abs(g.dx) > 8 && Math.abs(g.dy) < 12;
      },
      onPanResponderMove: (_, g) => {
        if (isReplyMode) {
          // Bidirectional swipe to reply: allow both left and right drag
          const newX = Math.max(-64, Math.min(64, g.dx));
          pan.setValue({ x: newX, y: 0 });
        } else {
          const startX = isOpen.current ? -openWidth : 0;
          const newX = startX + g.dx;
          const minX = resolvedActions.length > 0 ? -openWidth - 40 : 0;
          pan.setValue({ x: Math.min(0, Math.max(minX, newX)), y: 0 });
        }
      },
      onPanResponderRelease: (_, g) => {
        if (isReplyMode) {
          if (g.dx > 36 || g.dx < -36) {
            close();
            onReply?.();
          } else {
            close();
          }
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

  // Right-swipe (swiping right -> badge on left)
  const replyScaleLeft = isReplyMode ? pan.x.interpolate({
    inputRange: [0, 20, 50],
    outputRange: [0.5, 0.8, 1.15],
    extrapolate: 'clamp',
  }) : 0;

  const replyOpacityLeft = isReplyMode ? pan.x.interpolate({
    inputRange: [0, 15, 36],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  }) : 0;

  // Left-swipe (swiping left -> badge on right)
  const replyScaleRight = isReplyMode ? pan.x.interpolate({
    inputRange: [-50, -20, 0],
    outputRange: [1.15, 0.8, 0.5],
    extrapolate: 'clamp',
  }) : 0;

  const replyOpacityRight = isReplyMode ? pan.x.interpolate({
    inputRange: [-36, -15, 0],
    outputRange: [1, 0.5, 0],
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

      {isReplyMode && (
        <>
          <Animated.View style={[styles.replyBackgroundLeft, { opacity: replyOpacityLeft, transform: [{ scale: replyScaleLeft }] }]}>
            <View style={styles.replyCircle}>
              <Ionicons name="arrow-undo" size={16} color="#fff" />
            </View>
          </Animated.View>
          <Animated.View style={[styles.replyBackgroundRight, { opacity: replyOpacityRight, transform: [{ scale: replyScaleRight }] }]}>
            <View style={styles.replyCircle}>
              <Ionicons name="arrow-undo" size={16} color="#fff" />
            </View>
          </Animated.View>
        </>
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
  replyBackgroundLeft: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  replyBackgroundRight: {
    position: 'absolute',
    right: 14,
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
