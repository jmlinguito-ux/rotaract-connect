import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

interface DeclineReasonModalProps {
  visible: boolean;
  applicantName?: string;
  eventTitle?: string;
  /** Defaults to the join-request wording; override for other kinds of decline. */
  title?: string;
  description?: string;
  onConfirm: (remarks: string) => void;
  onCancel: () => void;
}

export function DeclineReasonModal({
  visible,
  applicantName = 'this participant',
  eventTitle,
  title,
  description,
  onConfirm,
  onCancel,
}: DeclineReasonModalProps) {
  const { colors: themeColors, isNightMode } = useTheme();
  const [remarks, setRemarks] = useState<string>('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setRemarks('');
    }
  }, [visible]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const handleConfirm = () => {
    onConfirm(remarks.trim());
  };

  const scrollRef = useRef<ScrollView>(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.avoidView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.backdrop}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          bounces={false}
        >
          <View style={[styles.card, { backgroundColor: themeColors.cardBg }]}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="alert-circle" size={22} color={colors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: themeColors.text }]}>{title ?? 'Decline Join Request'}</Text>
                <Text style={[styles.sub, { color: themeColors.textMuted }]}>
                  {description ??
                    `Enter remarks for ${applicantName} explaining why their request for ${eventTitle ? `"${eventTitle}"` : 'the event'} was declined.`}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: themeColors.primary }]}>Enter Reason</Text>
            <TextInput
              style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
              placeholder="Type your reason here (optional)..."
              placeholderTextColor={themeColors.textMuted}
              value={remarks}
              onChangeText={setRemarks}
              multiline
              numberOfLines={4}
            />

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={[styles.cancelText, { color: themeColors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                <Ionicons name="send" size={14} color="#fff" />
                <Text style={styles.confirmText}>Decline & Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  avoidView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  backdrop: { flexGrow: 1, justifyContent: 'flex-end', padding: 20, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 14 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 13, color: colors.text, backgroundColor: colors.surface, minHeight: 90, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.danger, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
