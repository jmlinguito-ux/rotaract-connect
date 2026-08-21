import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../../context/ThemeContext';

interface LocationPermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onPermissionGranted?: () => void;
  initialStep?: string;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  visible,
  onClose,
  onPermissionGranted,
}) => {
  const { colors: themeColors, isNightMode } = useTheme();

  const handleEnableForeground = async () => {
    try {
      const isServiceEnabled = await Location.hasServicesEnabledAsync();
      if (!isServiceEnabled) {
        if (Platform.OS === 'android') {
          await Location.enableNetworkProviderAsync().catch(() => {});
        } else {
          Linking.openSettings();
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        onPermissionGranted?.();
        onClose();
        return;
      }
      Linking.openSettings();
    } catch {
      Linking.openSettings();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]} activeOpacity={1}>
          <View style={styles.iconWrap}>
            <Ionicons name="navigate-circle" size={48} color="#D41367" />
          </View>

          <Text style={[styles.title, { color: themeColors.text }]}>Enable Location for On-Site Check-In</Text>
          <Text style={[styles.description, { color: themeColors.textMuted }]}>
            Rotaract Connect verifies your distance to the event venue when you tap Check In to credit your volunteer service hours.
          </Text>

          <View style={[styles.infoBox, { backgroundColor: isNightMode ? themeColors.cardBg : '#FDF2F8', borderColor: isNightMode ? themeColors.border : '#F9D6E5' }]}>
            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark" size={18} color="#D41367" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: themeColors.text }]}>Verified On-Premise Check-In</Text>
                <Text style={[styles.infoSub, { color: themeColors.textMuted }]}>
                  Confirms physical attendance at the event venue.
                </Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="flash-outline" size={18} color="#D41367" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: themeColors.text }]}>Zero Background Battery Drain</Text>
                <Text style={[styles.infoSub, { color: themeColors.textMuted }]}>
                  Location is checked only when you tap Check In or send an Emergency SOS.
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity style={styles.enableBtn} onPress={handleEnableForeground}>
            <Ionicons name="location" size={18} color="#fff" />
            <Text style={styles.enableBtnText}>Enable Location</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={[styles.cancelBtnText, { color: themeColors.textMuted }]}>Maybe Later</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D4136718',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  infoBox: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  infoSub: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  enableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: '#D41367',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  enableBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

