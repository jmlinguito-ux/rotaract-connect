import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { triggerEmergencySOS, cancelEmergencySOS, EMERGENCY_HOTLINES } from '../services/emergencyBroadcast';
import { EmergencyAlert } from '../types';

interface Props {
  variant?: 'icon' | 'badge' | 'full';
  style?: any;
}

export default function EmergencySosButton({ variant = 'icon', style }: Props) {
  const { user } = useAuth();
  const { users, pushNotification } = useData();
  const { colors: themeColors } = useTheme();

  const scrollRef = useRef<ScrollView>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [customMsg, setCustomMsg] = useState('');
  const [activeAlert, setActiveAlert] = useState<EmergencyAlert | null>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!user) return null;

  // Find user's club president to notify
  const clubPres = users.find(
    u => u.club_id === user.club_id && (u.role === 'CLUB_PRESIDENT' || u.position?.toLowerCase().includes('president'))
  );

  const handleCallHotline = (num: string) => {
    Linking.openURL(`tel:${num}`).catch(e => console.warn('Could not call hotline', e));
  };

  const handleBroadcastSOS = async () => {
    setLoading(true);
    try {
      const alert = await triggerEmergencySOS({
        user,
        customMessage: customMsg.trim() || undefined,
        pushNotificationFn: pushNotification,
        presidentUser: clubPres,
        nearbyUsers: users.filter(u => u.id !== user.id),
      });
      setActiveAlert(alert);
      setIsConfirmOpen(false);
      setCustomMsg('');
      Alert.alert(
        '🚨 SOS Broadcasted',
        `Your emergency broadcast and location link have been sent to all verified Rotaractors within 5 km and your Club President (${clubPres?.full_name || 'President'}).`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      Alert.alert('Broadcast Error', e?.message || 'Could not broadcast SOS.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!activeAlert) return;
    try {
      await cancelEmergencySOS(activeAlert.id);
      setActiveAlert(null);
      Alert.alert('SOS Cancelled', 'Emergency broadcast has been marked safe and removed.');
    } catch (e) {
      // ignore
    }
  };

  return (
    <>
      {activeAlert ? (
        <TouchableOpacity
          style={[styles.activeSosBtn, style]}
          onPress={() => {
            Alert.alert(
              'Active SOS Alert',
              'You currently have an active emergency broadcast.',
              [
                { text: 'Keep Active', style: 'cancel' },
                { text: "Cancel / I'm Safe", style: 'destructive', onPress: handleCancel },
              ]
            );
          }}
        >
          <Ionicons name="warning" size={14} color="#fff" />
          <Text style={styles.activeSosText}>SOS ACTIVE</Text>
        </TouchableOpacity>
      ) : variant === 'badge' ? (
        <TouchableOpacity
          style={[styles.activeSosBtn, { backgroundColor: '#EF4444' }, style]}
          onPress={() => setIsConfirmOpen(true)}
        >
          <Ionicons name="megaphone" size={14} color="#fff" />
          <Text style={styles.activeSosText}>SOS PANIC</Text>
        </TouchableOpacity>
      ) : variant === 'full' ? (
        <TouchableOpacity
          style={[styles.fullBtn, style]}
          onPress={() => setIsConfirmOpen(true)}
        >
          <Ionicons name="megaphone" size={20} color="#EF4444" />
          <Text style={styles.fullBtnText}>Emergency SOS Broadcast</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.iconBtn, style]}
          onPress={() => setIsConfirmOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="megaphone" size={18} color="#EF4444" />
        </TouchableOpacity>
      )}

      {/* Confirmation & Note Modal */}
      <Modal
        visible={isConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsConfirmOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.avoidView}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.modalBackdrop}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={true}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
              <View style={styles.modalHeader}>
                <View style={styles.warningCircle}>
                  <Ionicons name="warning" size={28} color="#EF4444" />
                </View>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Emergency SOS Broadcast</Text>
                <Text style={[styles.modalSub, { color: themeColors.textMuted }]}>
                  Instantly shares your GPS location link with all verified Rotaract members within 5 km and alerts your Club President.
                </Text>
              </View>

              {/* Direct Emergency Hotlines */}
              <View style={styles.hotlinesSection}>
                <Text style={[styles.hotlinesTitle, { color: themeColors.textMuted }]}>DIRECT EMERGENCY HOTLINES</Text>
                <View style={styles.hotlinesGrid}>
                  {EMERGENCY_HOTLINES.map(h => (
                    <TouchableOpacity
                      key={h.number}
                      style={[styles.hotlineCard, { borderColor: themeColors.border, backgroundColor: themeColors.bg }]}
                      onPress={() => handleCallHotline(h.number)}
                    >
                      <View style={[styles.hotlineIconBadge, { backgroundColor: h.color + '15' }]}>
                        <Ionicons name={h.icon as any} size={16} color={h.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.hotlineName, { color: themeColors.text }]}>{h.name}</Text>
                        <Text style={[styles.hotlineSub, { color: themeColors.textMuted }]}>{h.subtitle}</Text>
                      </View>
                      <View style={[styles.callPill, { backgroundColor: h.color }]}>
                        <Ionicons name="call" size={12} color="#fff" />
                        <Text style={styles.callPillText}>{h.number}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputWrap}>
                <Text style={[styles.inputLabel, { color: themeColors.textMuted }]}>
                  Optional Emergency Message / Note:
                </Text>
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: themeColors.bg,
                      color: themeColors.text,
                      borderColor: themeColors.border,
                    },
                  ]}
                  placeholder="e.g. Medical emergency, road assistance needed..."
                  placeholderTextColor={themeColors.textMuted}
                  value={customMsg}
                  onChangeText={setCustomMsg}
                  maxLength={120}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: themeColors.border }]}
                  onPress={() => setIsConfirmOpen(false)}
                  disabled={loading}
                >
                  <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.broadcastBtn}
                  onPress={handleBroadcastSOS}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="megaphone" size={18} color="#fff" />
                      <Text style={styles.broadcastBtnText}>Broadcast SOS</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  activeSosText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  fullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 8,
  },
  fullBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  avoidView: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBackdrop: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
  },
  modalHeader: {
    alignItems: 'center',
    textAlign: 'center',
  },
  warningCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  inputWrap: {
    marginTop: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 22,
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  broadcastBtn: {
    flex: 1.4,
    backgroundColor: '#DC2626',
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  broadcastBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  hotlinesSection: {
    marginTop: 14,
  },
  hotlinesTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  hotlinesGrid: {
    gap: 8,
  },
  hotlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  hotlineIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hotlineName: {
    fontSize: 13,
    fontWeight: '700',
  },
  hotlineSub: {
    fontSize: 11,
    marginTop: 1,
  },
  callPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  callPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
