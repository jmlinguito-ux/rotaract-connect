import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { NotificationPriority } from '../../types';
import { KeyboardAwareScrollView } from '../../components/KeyboardAwareScrollView';

type Props = NativeStackScreenProps<RootStackParamList, 'OrganizerBroadcast'>;

const PRIORITY_OPTIONS: { value: NotificationPriority; label: string; desc: string; icon: any }[] = [
  { value: 'NORMAL', label: 'Normal', desc: 'Standard informational notice', icon: 'information-circle-outline' },
  { value: 'ALERT', label: 'Alert', desc: 'Shown prominently to participants', icon: 'notifications-outline' },
  { value: 'HIGH', label: 'High Priority', desc: 'Prominent banner + vibration', icon: 'warning-outline' },
];

const TITLE_MAX = 120;
const BODY_MAX = 1000;

export default function OrganizerBroadcastScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { events, participantsFor, broadcastToEvent } = useData();
  const { user } = useAuth();
  const { colors } = useTheme();

  const event = events.find(e => e.id === eventId);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('NORMAL');
  const [sending, setSending] = useState(false);

  // Client-side guard mirrors the server authorization in send_event_broadcast.
  const canBroadcast = !!user && !!event && (
    event.organizer_user_id === user.id ||
    (event.co_organizer_user_ids ?? []).includes(user.id) ||
    user.role === 'DISTRICT_ADMIN' || user.role === 'APP_ADMIN' ||
    (user.role === 'CLUB_PRESIDENT' && user.club_id === event.organizing_club_id)
  );

  const recipientCount = participantsFor(eventId).filter(p => p.status === 'JOINED' && p.user_id !== user?.id).length;

  const handleSend = async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Please enter a banner title.'); return; }
    setSending(true);
    const res = await broadcastToEvent(eventId, title.trim(), message.trim(), priority);
    setSending(false);
    if (res.ok) {
      Alert.alert('Banner Sent', `Your ${priority === 'HIGH' ? 'high priority ' : ''}announcement was sent to ${recipientCount} participant${recipientCount === 1 ? '' : 's'}.`);
      navigation.goBack();
    } else {
      Alert.alert('Could not send', res.error || 'Please try again.');
    }
  };

  if (!event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['bottom']}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>Event not found.</Text>
      </SafeAreaView>
    );
  }

  if (!canBroadcast) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['bottom']}>
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={40} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Only the event's organizing team can send participant banners.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={['bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        keyboardTopMargin={30}
      >
        <View style={[styles.contextCard, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '3D' }]}>
          <Ionicons name="megaphone" size={18} color={colors.primary} />
          <Text style={[styles.contextText, { color: colors.primary }]} numberOfLines={2}>
            Announcing to {recipientCount} participant{recipientCount === 1 ? '' : 's'} of "{event.title}"
          </Text>
        </View>

        <Text style={[styles.label, { color: colors.text }]}>Title</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
          placeholder="e.g. Venue changed to the covered court"
          placeholderTextColor={colors.textMuted}
          value={title}
          onChangeText={t => setTitle(t.slice(0, TITLE_MAX))}
          maxLength={TITLE_MAX}
        />
        <Text style={[styles.counter, { color: colors.textMuted }]}>{title.length}/{TITLE_MAX}</Text>

        <Text style={[styles.label, { color: colors.text }]}>Message</Text>
        <TextInput
          style={[styles.input, styles.multiline, { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.text }]}
          placeholder="Add the details participants need to know…"
          placeholderTextColor={colors.textMuted}
          value={message}
          onChangeText={t => setMessage(t.slice(0, BODY_MAX))}
          multiline
        />
        <Text style={[styles.counter, { color: colors.textMuted }]}>{message.length}/{BODY_MAX}</Text>

        <Text style={[styles.label, { color: colors.text, marginTop: 8 }]}>Priority</Text>
        {PRIORITY_OPTIONS.map(opt => {
          const selected = priority === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.priorityRow, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary + '12' : colors.cardBg }]}
              onPress={() => setPriority(opt.value)}
            >
              <Ionicons name={opt.icon} size={20} color={selected ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.priorityLabel, { color: selected ? colors.primary : colors.text }]}>{opt.label}</Text>
                <Text style={[styles.priorityDesc, { color: colors.textMuted }]}>{opt.desc}</Text>
              </View>
              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </KeyboardAwareScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.cardBg }]}>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.primary }, (sending || !title.trim()) && { opacity: 0.5 }]}
          onPress={handleSend}
          disabled={sending || !title.trim()}
        >
          {sending ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="send" size={16} color="#fff" />
              <Text style={styles.sendBtnText}>Send Banner Notification</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },
  body: { padding: 16, paddingBottom: 32 },
  contextCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  contextText: { flex: 1, fontSize: 13, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  counter: { fontSize: 11, alignSelf: 'flex-end', marginTop: 4, marginBottom: 8 },
  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  priorityLabel: { fontSize: 14, fontWeight: '700' },
  priorityDesc: { fontSize: 12, marginTop: 1 },
  footer: { padding: 16, borderTopWidth: 1 },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
