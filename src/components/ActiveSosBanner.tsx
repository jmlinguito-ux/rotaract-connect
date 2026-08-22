import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeToActiveUserSos, cancelEmergencySOS } from '../services/emergencyBroadcast';
import { EmergencyAlert } from '../types';

export default function ActiveSosBanner() {
  const insets = useSafeAreaInsets();
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  // 1. Subscribe to active SOS state
  useEffect(() => {
    const unsub = subscribeToActiveUserSos(alert => {
      setActiveAlert(alert);
      if (alert) {
        // Calculate initial elapsed time
        const createdMs = new Date(alert.created_at).getTime();
        const diffSecs = Math.max(0, Math.floor((Date.now() - createdMs) / 1000));
        setElapsedSeconds(diffSecs);
      } else {
        setElapsedSeconds(0);
      }
    });
    return unsub;
  }, []);

  // 2. Pulse animation while active
  useEffect(() => {
    if (!activeAlert) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.75,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // Elapsed timer tick
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      pulseLoop.stop();
      clearInterval(interval);
    };
  }, [activeAlert]);

  if (!activeAlert) return null;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleResolve = () => {
    Alert.alert(
      "Confirm You're Safe",
      'This will cancel your emergency distress broadcast and notify nearby responders that you are safe.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: "Yes, I'm Safe",
          style: 'destructive',
          onPress: async () => {
            const alertId = activeAlert?.id;
            setActiveAlert(null);
            if (alertId) {
              await cancelEmergencySOS(alertId);
            }
          },
        },
      ]
    );
  };

  const handleCall911 = () => {
    Linking.openURL('tel:911').catch(e => console.warn('Could not call 911', e));
  };

  return (
    <View style={[styles.wrapper, { paddingTop: Math.max(insets.top, 8) }]}>
      <Animated.View style={[styles.container, { opacity: pulseAnim }]}>
        <View style={styles.leftCol}>
          <View style={styles.badgeRow}>
            <View style={styles.pulseDot} />
            <Text style={styles.badgeTitle}>EMERGENCY SOS ACTIVE</Text>
            <Text style={styles.timerText}>({formatTimer(elapsedSeconds)})</Text>
          </View>
          <Text style={styles.subText} numberOfLines={1}>
            Location shared with nearby Rotaractors & Club President
          </Text>
        </View>

        <View style={styles.rightCol}>
          <TouchableOpacity
            style={styles.quick911Btn}
            onPress={handleCall911}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="call" size={13} color="#EF4444" />
            <Text style={styles.quick911Text}>911</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.safeBtn}
            onPress={handleResolve}
            hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={styles.safeBtnText}>I'm Safe</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#DC2626',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 10,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#DC2626',
  },
  leftCol: {
    flex: 1,
    marginRight: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FEE2E2',
  },
  badgeTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  timerText: {
    color: '#FEE2E2',
    fontSize: 11,
    fontWeight: '700',
  },
  subText: {
    color: '#FEE2E2',
    fontSize: 10,
    marginTop: 2,
    opacity: 0.9,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quick911Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 3,
  },
  quick911Text: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '900',
  },
  safeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#15803D',
    borderWidth: 1,
    borderColor: '#4ADE80',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  safeBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
