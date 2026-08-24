import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { allocationState, describeAllocationMode } from '../../utils/clubAllocation';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubAllocation'>;

/**
 * Organizer view of how participant capacity is split between clubs: who has
 * used their slots, how much is still reserved, and how much anyone can take.
 * Slots can be raised per club, and the whole pool released early.
 */
export default function ClubAllocationScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const {
    events, users, clubs, participants, clubAllocations,
    setClubAllocation, releaseClubAllocations,
  } = useData();

  const event = events.find(e => e.id === eventId);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [busy, setBusy] = useState(false);

  const state = useMemo(
    () => (event ? allocationState(event, clubAllocations, participants, users) : null),
    [event, clubAllocations, participants, users],
  );

  if (!event || !state) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
        <Text style={[styles.empty, { color: themeColors.textMuted }]}>Event not found.</Text>
      </SafeAreaView>
    );
  }

  const canManage =
    !!user && (user.id === event.organizer_user_id
      || (event.co_organizer_user_ids ?? []).includes(user.id)
      || user.role === 'DISTRICT_ADMIN' || user.role === 'APP_ADMIN');

  // Every club that could take part, so the organizer can pre-allocate to a
  // club that has not registered anyone yet.
  const rows = useMemo(() => {
    const ids = new Set<string>([
      event.organizing_club_id,
      ...event.participating_club_ids,
      ...state.perClub.map(r => r.club_id),
    ]);
    return [...ids].filter(Boolean).map(club_id => {
      const found = state.perClub.find(r => r.club_id === club_id);
      return {
        club_id,
        club_name: clubs.find(c => c.id === club_id)?.club_name ?? 'Unknown club',
        allocated: found?.allocated ?? event.default_club_allocation ?? 0,
        used: found?.used ?? 0,
        remaining: found?.remaining ?? (event.default_club_allocation ?? 0),
      };
    }).sort((a, b) => b.used - a.used || a.club_name.localeCompare(b.club_name));
  }, [event, state, clubs]);

  const save = async (clubId: string) => {
    const n = parseInt(draft, 10);
    setEditing(null);
    if (!Number.isFinite(n) || n < 0) return;
    setBusy(true);
    await setClubAllocation(eventId, clubId, n);
    setBusy(false);
  };

  const doRelease = async () => {
    setConfirmRelease(false);
    setBusy(true);
    await releaseClubAllocations(eventId);
    setBusy(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={rows}
        keyExtractor={r => r.club_id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={[styles.summary, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.mode, { color: themeColors.primary }]}>
                {state.mode === 'NONE' ? 'No Allocation' : `${state.mode === 'SOFT' ? 'Soft' : 'Hard'} Allocation`}
              </Text>
              <Text style={[styles.modeHint, { color: themeColors.textMuted }]}>
                {describeAllocationMode(state.mode)}
              </Text>

              <View style={styles.statRow}>
                <Stat label="Capacity" value={state.capacity || '∞'} color={themeColors.text} />
                <Stat label="Taken" value={state.taken} color={themeColors.text} />
                <Stat label="Reserved" value={state.reserved} color={themeColors.primary} />
                <Stat
                  label="Open"
                  value={state.capacity ? state.generalAvailable : '∞'}
                  color={themeColors.text}
                />
              </View>

              {state.mode === 'SOFT' && (
                <Text style={[styles.releaseNote, { color: themeColors.textMuted }]}>
                  {state.released
                    ? 'Unused slots have been released to the general pool.'
                    : event.allocation_release_at
                      ? `Unused slots release ${new Date(event.allocation_release_at).toLocaleString()}.`
                      : 'No release deadline set — unused slots stay reserved.'}
                </Text>
              )}
            </View>

            {canManage && state.mode === 'SOFT' && !state.released && (
              <TouchableOpacity
                style={[styles.releaseBtn, { backgroundColor: themeColors.primary }]}
                onPress={() => setConfirmRelease(true)}
                disabled={busy}
              >
                <Ionicons name="lock-open-outline" size={16} color="#FFF" />
                <Text style={styles.releaseBtnText}>Release Unused Slots Now</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const isEditing = editing === item.club_id;
          const full = item.remaining === 0 && item.allocated > 0;
          return (
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardMain}>
                <Text style={[styles.clubName, { color: themeColors.text }]} numberOfLines={1}>
                  {item.club_name}
                </Text>
                <Text style={[styles.usage, { color: full ? themeColors.primary : themeColors.textMuted }]}>
                  {item.used} / {item.allocated} used
                  {state.released ? '' : ` · ${item.remaining} reserved`}
                </Text>
              </View>

              {isEditing ? (
                <View style={styles.editRow}>
                  <TextInput
                    style={[styles.slotInput, {
                      backgroundColor: themeColors.bg,
                      borderColor: themeColors.primary,
                      color: themeColors.text,
                    }]}
                    value={draft}
                    onChangeText={t => setDraft(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    autoFocus
                    onSubmitEditing={() => save(item.club_id)}
                  />
                  <TouchableOpacity onPress={() => save(item.club_id)} style={styles.iconBtn}>
                    <Ionicons name="checkmark" size={20} color={themeColors.primary} />
                  </TouchableOpacity>
                </View>
              ) : canManage && state.mode !== 'NONE' ? (
                <TouchableOpacity
                  style={[styles.editBtn, { borderColor: themeColors.border }]}
                  onPress={() => { setEditing(item.club_id); setDraft(String(item.allocated)); }}
                >
                  <Ionicons name="create-outline" size={14} color={themeColors.text} />
                  <Text style={[styles.editBtnText, { color: themeColors.text }]}>Slots</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>
            No clubs involved in this event yet.
          </Text>
        }
      />

      <ConfirmDialog
        visible={confirmRelease}
        title="Release unused slots?"
        message={`${state.reserved} reserved slot${state.reserved === 1 ? '' : 's'} will return to the general pool immediately. Any eligible club can then take them. This cannot be undone.`}
        confirmLabel="Release"
        onConfirm={doRelease}
        onClose={() => setConfirmRelease(false)}
      />
    </SafeAreaView>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 32 },
  summary: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  mode: { fontSize: 15, fontWeight: '900' },
  modeHint: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  statRow: { flexDirection: 'row', marginTop: 14, gap: 12 },
  stat: { flex: 1 },
  statValue: { fontSize: 19, fontWeight: '900' },
  statLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  releaseNote: { fontSize: 11.5, marginTop: 12, lineHeight: 16 },
  releaseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, marginBottom: 16,
  },
  releaseBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13.5 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  cardMain: { flex: 1 },
  clubName: { fontSize: 14, fontWeight: '800' },
  usage: { fontSize: 11.5, marginTop: 3, fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  slotInput: {
    width: 58, borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6, fontSize: 14, fontWeight: '700', textAlign: 'center',
  },
  iconBtn: { padding: 6 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  editBtnText: { fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 13, fontStyle: 'italic' },
});
