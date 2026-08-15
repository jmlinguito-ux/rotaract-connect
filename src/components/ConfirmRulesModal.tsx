import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface ConfirmRulesModalProps {
  visible: boolean;
  title: string;
  intro: string;
  /** The rules the user is agreeing to, rendered as a checklist. */
  rules: string[];
  confirmLabel: string;
  confirmIcon?: keyof typeof Ionicons.glyphMap;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation step shown before an action that locks an event down.
 *
 * Built as an in-app modal rather than Alert.alert because Alert is a no-op on
 * react-native-web — a confirmation the user never sees would silently approve.
 */
export function ConfirmRulesModal({
  visible,
  title,
  intro,
  rules,
  confirmLabel,
  confirmIcon = 'checkmark-circle',
  onConfirm,
  onCancel,
}: ConfirmRulesModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.avoidView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.backdrop}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Ionicons name="lock-closed" size={20} color={colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.sub}>{intro}</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>WHAT YOU WON'T BE ABLE TO CHANGE</Text>

            <ScrollView style={styles.ruleScroll} contentContainerStyle={styles.ruleList}>
              {rules.map(rule => (
                <View key={rule} style={styles.ruleRow}>
                  <Ionicons name="ellipse" size={6} color={colors.textMuted} style={{ marginTop: 6 }} />
                  <Text style={styles.ruleText}>{rule}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
                <Ionicons name={confirmIcon} size={15} color="#fff" />
                <Text style={styles.confirmText}>{confirmLabel}</Text>
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
  backdrop: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, gap: 12, maxHeight: '85%' },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  ruleScroll: { flexGrow: 0 },
  ruleList: { gap: 8 },
  ruleRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  ruleText: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 17 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
