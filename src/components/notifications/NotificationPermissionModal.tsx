import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { registerForPushNotificationsAsync } from '../../services/notifications';

interface NotificationPermissionModalProps {
  visible: boolean;
  onClose: () => void;
  onPermissionGranted?: (token: string | null) => void;
}

export const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = ({
  visible,
  onClose,
  onPermissionGranted,
}) => {
  const { colors: themeColors, isNightMode } = useTheme();

  const handleEnable = async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      onPermissionGranted?.(token);
    } finally {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isNightMode ? themeColors.cardBg : '#FFFFFF',
              borderColor: isNightMode ? themeColors.border : '#F1F5F9',
            },
          ]}
        >
          {/* Header Icon Circle */}
          <View style={[styles.iconCircle, { backgroundColor: themeColors.primary }]}>
            <Ionicons name="notifications" size={32} color="#fff" />
          </View>

          <Text style={[styles.title, { color: themeColors.text }]}>
            Stay Connected in Real Time
          </Text>

          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
            Get crucial updates delivered right when you need them across District 3800.
          </Text>

          {/* Value Props List */}
          <View style={styles.featureList}>
            <View style={styles.featureRow}>
              <View style={[styles.featureIconWrap, { backgroundColor: isNightMode ? themeColors.surface : '#FDF2F8' }]}>
                <Ionicons name="calendar" size={18} color={themeColors.primary} />
              </View>
              <View style={styles.featureContent}>
                <Text style={[styles.featureTitle, { color: themeColors.text }]}>
                  Event Invites & Approvals
                </Text>
                <Text style={[styles.featureDesc, { color: themeColors.textMuted }]}>
                  Never miss multi-club invitations, president approvals, or 1-hour start reminders.
                </Text>
              </View>
            </View>

            <View style={styles.featureRow}>
              <View style={[styles.featureIconWrap, { backgroundColor: isNightMode ? '#064E3B33' : '#ECFDF5' }]}>
                <Ionicons name="checkmark-circle" size={18} color={themeColors.success} />
              </View>
              <View style={styles.featureContent}>
                <Text style={[styles.featureTitle, { color: themeColors.text }]}>
                  Instant Attendance Logs
                </Text>
                <Text style={[styles.featureDesc, { color: themeColors.textMuted }]}>
                  Get immediate confirmation on on-site GPS check-ins, QR pass scans, and logged service hours.
                </Text>
              </View>
            </View>

            <View style={styles.featureRow}>
              <View style={[styles.featureIconWrap, { backgroundColor: isNightMode ? '#7F1D1D33' : '#FEF2F2' }]}>
                <Ionicons name="shield-checkmark" size={18} color={themeColors.danger} />
              </View>
              <View style={styles.featureContent}>
                <Text style={[styles.featureTitle, { color: themeColors.text }]}>
                  Safety Network SOS Alerts
                </Text>
                <Text style={[styles.featureDesc, { color: themeColors.textMuted }]}>
                  High-priority distress alerts with map links when nearby members trigger SOS.
                </Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleEnable}
            activeOpacity={0.85}
          >
            <Ionicons name="notifications-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Enable Notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryBtnText, { color: themeColors.textMuted }]}>
              Maybe Later
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  featureList: {
    width: '100%',
    gap: 14,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  primaryBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
