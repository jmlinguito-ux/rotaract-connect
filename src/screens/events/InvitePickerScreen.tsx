import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import UserAvatar from '../../components/UserAvatar';
import { VerifiedName } from '../../components/VerifiedCheck';
import { isOnOrganizingTeam } from '../../utils/eventApproval';

type Props = NativeStackScreenProps<RootStackParamList, 'InvitePicker'>;

export default function InvitePickerScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { users, events, invitations, participants, invite } = useData();
  const { user } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Absolutely positioned children ignore their parent's padding in RN, so the
  // footer below needs the bottom inset applied directly to clear the Android nav bar.
  const insets = useSafeAreaInsets();

  const event = events.find(e => e.id === eventId);

  // Deep links must honor the event's invite policy too, not just the Invite button.
  if (event && user && !isOnOrganizingTeam(event, user) && !event.allow_participant_invites) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
        <Text style={[styles.empty, { color: themeColors.textMuted }]}>Only the organizing team can send invitations for this event.</Text>
      </SafeAreaView>
    );
  }

  const inviteableUsers = useMemo(() => {
    if (!user) return [];
    return users.filter(u => {
      if (u.id === user.id) return false;
      if (u.verification_status !== 'VERIFIED') return false;
      const alreadyInvited = invitations.some(i => i.event_id === eventId && i.invited_user_id === u.id && i.status !== 'DECLINED');
      const alreadyJoined = participants.some(p => p.event_id === eventId && p.user_id === u.id);
      if (alreadyInvited || alreadyJoined) return false;
      if (q && !u.full_name.toLowerCase().includes(q.toLowerCase()) && !u.club_name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [users, invitations, participants, eventId, q, user]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = () => {
    if (!user || selected.size === 0) return;
    selected.forEach(id => invite(eventId, id, user));
    Alert.alert('Invitations sent', `Invited ${selected.size} Rotaractor${selected.size === 1 ? '' : 's'} to ${event?.title ?? 'event'}.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <View style={[styles.searchWrap, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <Ionicons name="search" size={18} color={themeColors.textMuted} />
        <TextInput
          style={[styles.search, { color: themeColors.text }]}
          placeholder="Search verified Rotaractors"
          placeholderTextColor={themeColors.textMuted}
          value={q}
          onChangeText={setQ}
          autoFocus
        />
      </View>
      <FlatList
        data={inviteableUsers}
        keyExtractor={i => i.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: themeColors.border }]} />}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.id);
          return (
            <TouchableOpacity style={styles.row} onPress={() => toggle(item.id)}>
              <UserAvatar user={item} size={40} />
              <View style={{ flex: 1 }}>
                <VerifiedName user={item} textStyle={[styles.name, { color: themeColors.text }]} numberOfLines={1} />
                <Text style={[styles.meta, { color: themeColors.textMuted }]}>{item.club_name}</Text>
              </View>
              <View style={[styles.check, { borderColor: themeColors.border }, isSelected && [styles.checkActive, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }]]}>
                {isSelected && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No Rotaractors match.</Text>}
      />
      <View style={[styles.footer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border, paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: themeColors.primary }, selected.size === 0 && styles.sendBtnDisabled]} disabled={selected.size === 0} onPress={submit}>
          <Ionicons name="send" size={16} color="#fff" />
          <Text style={styles.sendText}>Send {selected.size > 0 ? `(${selected.size})` : ''} Invitation{selected.size === 1 ? '' : 's'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  search: { flex: 1, fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 62 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, padding: 14, borderRadius: 12 },
  sendBtnDisabled: { backgroundColor: '#E4B0C6' },
  sendText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
