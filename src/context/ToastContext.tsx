import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
  Vibration,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './ThemeContext';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastOptions {
  id?: string;
  type?: ToastType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors: themeColors, isNightMode } = useTheme();
  const insets = useSafeAreaInsets();

  const [toast, setToast] = useState<ToastOptions | null>(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hideToast = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setToast(null);
    });
  }, [translateY, opacity]);

  const showToast = useCallback(
    (opts: ToastOptions) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setToast(opts);

      // Light haptic feedback if platform allows
      if (Platform.OS !== 'web') {
        try {
          Vibration.vibrate(opts.type === 'error' ? [0, 40, 60, 40] : 30);
        } catch {
          // Ignore vibration failure
        }
      }

      translateY.setValue(-120);
      opacity.setValue(0);

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      const duration = opts.duration ?? 4500;
      if (duration > 0) {
        timerRef.current = setTimeout(() => {
          hideToast();
        }, duration);
      }
    },
    [translateY, opacity, hideToast],
  );

  const getIconAndColor = (type: ToastType = 'info') => {
    switch (type) {
      case 'success':
        return { icon: 'checkmark-circle' as const, color: '#10B981', bg: isNightMode ? '#064E3B' : '#ECFDF5' };
      case 'warning':
        return { icon: 'warning' as const, color: '#F59E0B', bg: isNightMode ? '#78350F' : '#FFFBEB' };
      case 'error':
        return { icon: 'alert-circle' as const, color: '#EF4444', bg: isNightMode ? '#7F1D1D' : '#FEF2F2' };
      case 'info':
      default:
        return { icon: 'information-circle' as const, color: themeColors.primary, bg: isNightMode ? '#1E293B' : '#EFF6FF' };
    }
  };

  const currentStyle = toast ? getIconAndColor(toast.type) : null;

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {toast && (
        <Animated.View
          style={[
            styles.container,
            {
              top: insets.top + (Platform.OS === 'ios' ? 4 : 12),
              transform: [{ translateY }],
              opacity,
            },
          ]}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.toastCard,
              {
                backgroundColor: themeColors.cardBg,
                borderColor: (currentStyle?.color || themeColors.primary) + '55',
                shadowColor: '#000',
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: (currentStyle?.color || themeColors.primary) + '1A' }]}>
              <Ionicons name={currentStyle?.icon} size={22} color={currentStyle?.color} />
            </View>

            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: themeColors.text }]} numberOfLines={1}>
                {toast.title}
              </Text>
              {!!toast.message && (
                <Text style={[styles.message, { color: themeColors.textMuted }]} numberOfLines={2}>
                  {toast.message}
                </Text>
              )}
            </View>

            {toast.actionLabel && toast.onAction && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={[styles.actionButton, { backgroundColor: currentStyle?.color || themeColors.primary }]}
                onPress={() => {
                  hideToast();
                  toast.onAction?.();
                }}
              >
                <Text style={styles.actionText}>{toast.actionLabel}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity activeOpacity={0.6} onPress={hideToast} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 99999,
    alignItems: 'center',
  },
  toastCard: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    fontSize: 12,
    lineHeight: 16,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
});
