import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmergencyAlert } from '../types';
import UserAvatar from './UserAvatar';
import { formatDistance } from '../utils/checkIn';
import { playEmergencySound, stopAlertSound } from '../services/sound';
import { useTheme } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  alert: EmergencyAlert | null;
  distanceMetersAway?: number;
  onDismiss: () => void;
}

export default function EmergencyAlertModal({
  visible,
  alert,
  distanceMetersAway,
  onDismiss,
}: Props) {
  const { colors: themeColors, isNightMode } = useTheme();
  useEffect(() => {
    if (visible && alert && alert.playSound !== false) {
      playEmergencySound();
    } else {
      stopAlertSound();
    }
    return () => {
      stopAlertSound();
    };
  }, [visible, alert]);

  if (!alert) return null;

  const handleOpenMap = async () => {
    try {
      if (alert.map_url) {
        await Linking.openURL(alert.map_url);
      }
    } catch (e) {
      console.warn('Could not open map link', e);
    }
  };

  const handleCall = async () => {
    if (!alert.contact_number) return;
    try {
      const cleaned = alert.contact_number.replace(/[^0-9+]/g, '');
      await Linking.openURL(`tel:${cleaned}`);
    } catch (e) {
      console.warn('Could not make phone call', e);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: isNightMode ? themeColors.cardBg : '#FFFFFF', borderColor: themeColors.border }]}>
          {/* Header Badge */}
          <View style={styles.alertHeader}>
            <View style={styles.iconPulse}>
              <Ionicons name="warning" size={32} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.alertHeaderTitle}>EMERGENCY SOS</Text>
              <Text style={styles.alertHeaderSub}>
                Nearby Rotaractor requested help
              </Text>
            </View>
          </View>

          {/* User Info */}
          <View style={[styles.userSection, { borderBottomColor: isNightMode ? themeColors.border : '#F3F4F6' }]}>
            <UserAvatar
              user={{ full_name: alert.full_name, avatar_url: alert.avatar_url }}
              size={56}
            />
            <View style={styles.userDetails}>
              <Text style={[styles.userName, { color: themeColors.text }]}>{alert.full_name}</Text>
              <Text style={[styles.userClub, { color: themeColors.textMuted }]}>{alert.club_name}</Text>
              {distanceMetersAway !== undefined && distanceMetersAway > 0 && (
                <View style={[styles.distancePill, { backgroundColor: isNightMode ? '#450A0A' : '#FEF2F2', borderColor: isNightMode ? '#7F1D1D' : '#FECACA' }]}>
                  <Ionicons name="navigate" size={12} color="#EF4444" />
                  <Text style={styles.distanceText}>
                    Approx. {formatDistance(distanceMetersAway)} away
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Location & Message Info Box */}
          <View style={[styles.infoBox, { backgroundColor: isNightMode ? themeColors.surface : '#F9FAFB', borderColor: isNightMode ? themeColors.border : '#E5E7EB' }]}>
            <View style={styles.infoRow}>
              <Ionicons name="location-sharp" size={18} color="#EF4444" />
              <Text style={[styles.infoText, { color: themeColors.text }]} numberOfLines={2}>
                {alert.address_hint || 'Coordinates provided'}
              </Text>
            </View>
            {alert.message ? (
              <View style={[styles.infoRow, { marginTop: 8 }]}>
                <Ionicons name="chatbubble-ellipses" size={16} color={themeColors.textMuted} />
                <Text style={[styles.messageText, { color: themeColors.textMuted }]}>"{alert.message}"</Text>
              </View>
            ) : null}
          </View>

          {/* Actions */}
          <View style={styles.actionColumn}>
            <TouchableOpacity style={styles.navigateBtn} onPress={handleOpenMap}>
              <Ionicons name="map" size={20} color="#fff" />
              <Text style={styles.navigateBtnText}>Open Location in Maps</Text>
            </TouchableOpacity>

            {alert.contact_number ? (
              <TouchableOpacity style={[styles.callBtn, { backgroundColor: isNightMode ? themeColors.surface : '#F3F4F6' }]} onPress={handleCall}>
                <Ionicons name="call" size={18} color={themeColors.text} />
                <Text style={[styles.callBtnText, { color: themeColors.text }]}>Call ({alert.contact_number})</Text>
              </TouchableOpacity>
            ) : null}

            {/* Quick Emergency Hotlines */}
            <View style={styles.hotlinesRow}>
              <TouchableOpacity
                style={[styles.hotlinePill, { backgroundColor: '#EF4444' }]}
                onPress={() => Linking.openURL('tel:911').catch(e => console.warn(e))}
              >
                <Ionicons name="shield" size={12} color="#fff" />
                <Text style={styles.hotlinePillText}>Call 911</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.hotlinePill, { backgroundColor: '#DC2626' }]}
                onPress={() => Linking.openURL('tel:143').catch(e => console.warn(e))}
              >
                <Ionicons name="medkit" size={12} color="#fff" />
                <Text style={styles.hotlinePillText}>Call Red Cross (143)</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
              <Text style={[styles.dismissBtnText, { color: themeColors.textMuted }]}>Dismiss Alert</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  iconPulse: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  alertHeaderSub: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  userDetails: {
    flex: 1,
    marginLeft: 14,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  userClub: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 2,
  },
  distancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
    gap: 4,
  },
  distanceText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: '#F9FAFB',
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  messageText: {
    flex: 1,
    fontSize: 13,
    color: '#4B5563',
    fontStyle: 'italic',
  },
  actionColumn: {
    padding: 20,
    gap: 10,
  },
  navigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  navigateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 13,
    borderRadius: 14,
    gap: 8,
  },
  callBtnText: {
    color: '#1F2937',
    fontSize: 14,
    fontWeight: '700',
  },
  hotlinesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  hotlinePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  hotlinePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dismissBtnText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
});
