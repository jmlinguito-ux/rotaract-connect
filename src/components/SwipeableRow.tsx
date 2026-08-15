import React, { useRef } from 'react';
import { View, Animated, PanResponder, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
}

export function SwipeableRow({ children, onDelete }: SwipeableRowProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const isOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal gestures
        return Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dy) < 12;
      },
      onPanResponderMove: (_, gestureState) => {
        const startX = isOpen.current ? -80 : 0;
        const newX = startX + gestureState.dx;
        // Restrict drag bounds between -120 and 0
        pan.setValue({ x: Math.min(0, Math.max(-120, newX)), y: 0 });
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -40 || (isOpen.current && gestureState.dx < 20)) {
          // Snap open
          isOpen.current = true;
          Animated.spring(pan, {
            toValue: { x: -80, y: 0 },
            useNativeDriver: false,
            bounciness: 4,
          }).start();
        } else {
          // Snap closed
          isOpen.current = false;
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            bounciness: 4,
          }).start();
        }
      },
    })
  ).current;

  const handleDelete = () => {
    Animated.timing(pan, {
      toValue: { x: -400, y: 0 },
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      onDelete();
    });
  };

  const deleteOpacity = pan.x.interpolate({
    inputRange: [-75, -10, 0],
    outputRange: [1, 0.2, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Background Delete Action Button */}
      <Animated.View style={[styles.deleteBackground, { opacity: deleteOpacity }]}>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.85}>
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Foreground Swipeable Item */}
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
  container: {
    position: 'relative',
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 75,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    zIndex: 0,
  },
  deleteBtn: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  deleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
