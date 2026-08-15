import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  /** Omit to render a single-button notice instead of a confirmation. */
  onConfirm?: () => void;
  onClose: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * In-app confirmation dialog. React Native Web has no Alert implementation, so
 * anything gated behind Alert.alert silently does nothing in the browser build —
 * this renders the same prompt on every platform.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  onConfirm,
  onClose,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
}: Props) {
  const { colors: themeColors } = useTheme();
  const accent = destructive ? themeColors.danger : themeColors.primary;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: themeColors.cardBg }]}
          activeOpacity={1}
          onPress={e => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: themeColors.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: themeColors.textMuted }]}>{message}</Text> : null}

          <View style={styles.actions}>
            {onConfirm ? (
              <TouchableOpacity style={[styles.btn, { borderColor: themeColors.border }]} onPress={onClose}>
                <Text style={[styles.btnText, { color: themeColors.textMuted }]}>{cancelLabel}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.btn, styles.primaryBtn, { backgroundColor: accent, borderColor: accent }]}
              onPress={() => {
                if (onConfirm) onConfirm();
                else onClose();
              }}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>{onConfirm ? confirmLabel : 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 360, borderRadius: 18, padding: 20 },
  title: { fontSize: 16, fontWeight: '800' },
  message: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  primaryBtn: { minWidth: 96, alignItems: 'center' },
  btnText: { fontSize: 13, fontWeight: '700' },
});
