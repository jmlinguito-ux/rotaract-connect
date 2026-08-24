import React, { useRef, useState, useEffect } from 'react';
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Text,
  Dimensions,
  Animated,
  PanResponder,
  PanResponderInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  imageUri: string | null;
  title?: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Full-resolution zoomable and movable image viewer modal.
 * Supports:
 * - Pinch-to-zoom (up to 4x)
 * - Double-tap to toggle zoom (1x <-> 2.5x)
 * - Pan / Drag to explore zoomed details
 * - Reset zoom button
 * - Safe area status bar header
 */
export default function ZoomableImageModal({
  visible,
  imageUri,
  title = 'Payment Receipt',
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const currentScale = useRef(1);
  const currentTranslateX = useRef(0);
  const currentTranslateY = useRef(0);

  const [scaleDisplay, setScaleDisplay] = useState(1);
  const lastTapRef = useRef<number>(0);
  const initialDistanceRef = useRef<number | null>(null);
  const initialScaleOnPinchRef = useRef<number>(1);

  // Reset transforms whenever the modal opens or closes
  useEffect(() => {
    if (visible) {
      resetTransforms();
    }
  }, [visible, imageUri]);

  const resetTransforms = () => {
    currentScale.current = 1;
    currentTranslateX.current = 0;
    currentTranslateY.current = 0;
    setScaleDisplay(1);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start();
  };

  const getDistance = (touches: any[]): number => {
    const [t1, t2] = touches;
    const dx = t1.pageX - t2.pageX;
    const dy = t1.pageY - t2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder: PanResponderInstance = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          initialDistanceRef.current = getDistance(touches);
          initialScaleOnPinchRef.current = currentScale.current;
        }

        // Double tap detection
        const now = Date.now();
        if (touches.length === 1 && now - lastTapRef.current < 300) {
          // Double tapped!
          if (currentScale.current > 1.2) {
            resetTransforms();
          } else {
            currentScale.current = 2.5;
            setScaleDisplay(2.5);
            Animated.spring(scale, { toValue: 2.5, useNativeDriver: true }).start();
          }
          lastTapRef.current = 0;
        } else if (touches.length === 1) {
          lastTapRef.current = now;
        }
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;

        // Two-finger pinch to zoom
        if (touches.length === 2 && initialDistanceRef.current) {
          const currentDistance = getDistance(touches);
          const factor = currentDistance / initialDistanceRef.current;
          let nextScale = initialScaleOnPinchRef.current * factor;
          nextScale = Math.max(1, Math.min(nextScale, 4));

          currentScale.current = nextScale;
          setScaleDisplay(Math.round(nextScale * 10) / 10);
          scale.setValue(nextScale);
          return;
        }

        // One-finger or two-finger pan/drag when zoomed
        if (currentScale.current > 1) {
          const maxTranslateX = (SCREEN_WIDTH * (currentScale.current - 1)) / 2 + 50;
          const maxTranslateY = (SCREEN_HEIGHT * (currentScale.current - 1)) / 2 + 50;

          const nextX = Math.max(-maxTranslateX, Math.min(currentTranslateX.current + gestureState.dx, maxTranslateX));
          const nextY = Math.max(-maxTranslateY, Math.min(currentTranslateY.current + gestureState.dy, maxTranslateY));

          translateX.setValue(nextX);
          translateY.setValue(nextY);
        }
      },

      onPanResponderRelease: (_evt, gestureState) => {
        initialDistanceRef.current = null;

        if (currentScale.current > 1) {
          currentTranslateX.current += gestureState.dx;
          currentTranslateY.current += gestureState.dy;

          const maxTranslateX = (SCREEN_WIDTH * (currentScale.current - 1)) / 2;
          const maxTranslateY = (SCREEN_HEIGHT * (currentScale.current - 1)) / 2;

          // Snap back if panned beyond boundaries
          let boundedX = currentTranslateX.current;
          let boundedY = currentTranslateY.current;

          if (boundedX > maxTranslateX) boundedX = maxTranslateX;
          if (boundedX < -maxTranslateX) boundedX = -maxTranslateX;
          if (boundedY > maxTranslateY) boundedY = maxTranslateY;
          if (boundedY < -maxTranslateY) boundedY = -maxTranslateY;

          currentTranslateX.current = boundedX;
          currentTranslateY.current = boundedY;

          Animated.parallel([
            Animated.spring(translateX, { toValue: boundedX, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: boundedY, useNativeDriver: true }),
          ]).start();
        } else {
          // Snap back scale and position if less than 1
          resetTransforms();
        }
      },
    })
  ).current;

  if (!visible || !imageUri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.container}>
        {/* Top Header */}
        <View style={[styles.header, { top: insets.top + 10 }]}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.headerSubtitle}>Pinch or double-tap to zoom · Drag to move</Text>
          </View>

          {scaleDisplay > 1.05 ? (
            <TouchableOpacity style={styles.resetBtn} onPress={resetTransforms}>
              <Ionicons name="refresh-outline" size={15} color="#fff" />
              <Text style={styles.resetText}>{Math.round(scaleDisplay * 100)}%</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Interactive Zoom & Pan Area */}
        <View style={styles.imageArea} {...panResponder.panHandlers}>
          <Animated.Image
            source={{ uri: imageUri }}
            style={[
              styles.image,
              {
                transform: [
                  { scale },
                  { translateX },
                  { translateY },
                ],
              },
            ]}
            resizeMode="contain"
          />
        </View>

        {/* Bottom Hint Banner */}
        <View style={[styles.bottomHint, { bottom: insets.bottom + 16 }]}>
          <Text style={styles.hintText}>
            {scaleDisplay > 1.05 ? 'Drag to inspect details' : 'Double-tap or pinch to magnify'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    marginTop: 1,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  resetText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  imageArea: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.78,
  },
  bottomHint: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  hintText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11.5,
    fontWeight: '600',
  },
});
