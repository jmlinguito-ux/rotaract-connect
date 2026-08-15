import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { AppUser, UserRole } from '../../types';
import { ASSIGNABLE_ROLES, ROLE_BADGES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../utils/roles';
import UserAvatar from '../../components/UserAvatar';
import FullImageModal from '../../components/FullImageModal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import RoleBadgeIcon from '../../components/RoleBadgeIcon';
import { VerifiedName } from '../../components/VerifiedCheck';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleManagement'>;

type Filter = 'ALL' | UserRole;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'APP_ADMIN', label: 'App Admins' },
  { key: 'DISTRICT_ADMIN', label: 'District Admins' },
  { key: 'CLUB_PRESIDENT', label: 'Presidents' },
  { key: 'MEMBER', label: 'Members' },
];

export default function RoleManagementScreen({ navigation }: Props) {
  const { user, updateProfile } = useAuth();
  const { users, updateUserRole } = useData();
  const { colors: themeColors } = useTheme();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [target, setTarget] = useState<AppUser | null>(null);
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm?: () => void;
  } | null>(null);

  const isAppAdmin = user?.role === 'APP_ADMIN';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter(u => (filter === 'ALL' ? true : u.role === filter))
      .filter(u => !q || [u.full_name, u.username, u.email, u.club_name, u.position]
        .some(field => field?.toLowerCase().includes(q)))
      .sort((a, b) => {
        // Admins first so the current power structure is visible at a glance.
        const rank = (r: UserRole) => ASSIGNABLE_ROLES.length - ASSIGNABLE_ROLES.indexOf(r);
        return rank(a.role) - rank(b.role) || a.full_name.localeCompare(b.full_name);
      });
  }, [users, query, filter]);

  const counts = useMemo(() => ({
    APP_ADMIN: users.filter(u => u.role === 'APP_ADMIN').length,
    DISTRICT_ADMIN: users.filter(u => u.role === 'DISTRICT_ADMIN').length,
  }), [users]);

  const applyRole = (targetUser: AppUser, role: UserRole) => {
    updateUserRole(targetUser.id, role, user ?? undefined);
    // AuthContext holds its own copy of the signed-in user, so mirror the change
    // there when an admin changes their own role.
    if (user && user.id === targetUser.id) updateProfile({ role });
    setTarget(null);
    setDialog({
      title: 'Role Updated',
      message: `${targetUser.full_name} is now ${ROLE_LABELS[role]}. They have been notified.`,
    });
  };

  const handleAssign = (targetUser: AppUser, role: UserRole) => {
    if (targetUser.role === role) {
      setTarget(null);
      return;
    }

    const isSelfDemotion = user?.id === targetUser.id && role !== 'APP_ADMIN';
    const isLastAppAdmin = targetUser.role === 'APP_ADMIN' && role !== 'APP_ADMIN' && counts.APP_ADMIN <= 1;

    if (isLastAppAdmin) {
      setTarget(null);
      setDialog({
        title: 'Cannot Remove Last App Admin',
        message: 'Assign App Admin to another user first — the app must always have at least one.',
      });
      return;
    }

    if (isSelfDemotion) {
      setDialog({
        title: 'Remove Your Own Admin Access?',
        message: `You will lose App Admin tools immediately and become ${ROLE_LABELS[role]}.`,
        confirmLabel: 'Remove Access',
        destructive: true,
        onConfirm: () => applyRole(targetUser, role),
      });
      return;
    }

    if (role === 'APP_ADMIN' || role === 'DISTRICT_ADMIN') {
      setDialog({
        title: `Assign ${ROLE_LABELS[role]}?`,
        message: `${targetUser.full_name} will get ${ROLE_LABELS[role]} permissions. ${ROLE_DESCRIPTIONS[role]}`,
        confirmLabel: 'Assign',
        onConfirm: () => applyRole(targetUser, role),
      });
      return;
    }

    applyRole(targetUser, role);
  };

  if (!isAppAdmin) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
        <Ionicons name="lock-closed-outline" size={40} color={themeColors.textMuted} />
        <Text style={[styles.lockedTitle, { color: themeColors.text }]}>App Admins Only</Text>
        <Text style={[styles.lockedSub, { color: themeColors.textMuted }]}>
          Only an App Admin can assign District Admin and App Admin roles.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: themeColors.primary }]}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <View style={[styles.searchWrap, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
        <Ionicons name="search" size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search any user by name, club, or email"
          placeholderTextColor={themeColors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Without flexGrow: 0 the horizontal ScrollView takes the remaining column
        // height and stretches every chip down with it.
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, {
                backgroundColor: active ? themeColors.primary : themeColors.cardBg,
                borderColor: active ? themeColors.primary : themeColors.border,
              }]}
            >
              <Text style={[styles.filterChipText, { color: active ? '#fff' : themeColors.textMuted }]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[styles.summary, { backgroundColor: themeColors.primary + '14', borderColor: themeColors.primary + '3D' }]}>
        <Ionicons name="information-circle-outline" size={16} color={themeColors.primary} />
        <Text style={[styles.summaryText, { color: themeColors.text }]}>
          {counts.APP_ADMIN} App Admin{counts.APP_ADMIN === 1 ? '' : 's'} • {counts.DISTRICT_ADMIN} District Admin{counts.DISTRICT_ADMIN === 1 ? '' : 's'}. Tap a user to change their role.
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={u => u.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>No users match this search.</Text>
        }
        renderItem={({ item }) => {
          const badge = ROLE_BADGES[item.role];
          return (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => setTarget(item)}
              activeOpacity={0.8}
            >
              <UserAvatar user={item} size={44} onPressImage={uri => setFullImageUri(uri)} />
              <View style={{ flex: 1 }}>
                <VerifiedName
                  user={{ verification_status: item.verification_status }}
                  name={`${item.full_name}${user?.id === item.id ? ' (You)' : ''}`}
                  textStyle={[styles.name, { color: themeColors.text }]}
                  numberOfLines={1}
                />
                <Text style={[styles.meta, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {item.club_name} • {item.position}
                </Text>
                <View style={[styles.rolePill, {
                  backgroundColor: (badge?.color ?? themeColors.textMuted) + '1F',
                  borderColor: (badge?.color ?? themeColors.border),
                }]}>
                  {badge ? <RoleBadgeIcon badge={badge} size={10} /> : null}
                  <Text style={[styles.rolePillText, { color: badge?.color ?? themeColors.textMuted }]}>
                    {ROLE_LABELS[item.role]}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          );
        }}
      />

      {/* Role picker. An in-screen overlay rather than a Modal, so the
          confirmation dialog can present over it without modal stacking. */}
      {target && (
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setTarget(null)} />
          <View style={[styles.sheet, { backgroundColor: themeColors.cardBg }]}>
            <View style={styles.sheetHeader}>
              <UserAvatar user={target} size={48} />
              <View style={{ flex: 1 }}>
                <VerifiedName user={target} textStyle={[styles.sheetName, { color: themeColors.text }]} checkSize={14} />
                <Text style={[styles.meta, { color: themeColors.textMuted }]}>
                  Currently {ROLE_LABELS[target.role]}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTarget(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            {ASSIGNABLE_ROLES.map(role => {
              const selected = target.role === role;
              const badge = ROLE_BADGES[role];
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleOption, {
                    borderColor: selected ? themeColors.primary : themeColors.border,
                    backgroundColor: selected ? themeColors.primary + '0F' : 'transparent',
                  }]}
                  onPress={() => handleAssign(target, role)}
                >
                  <View style={[styles.roleIcon, { backgroundColor: (badge?.color ?? themeColors.primary) + '1F' }]}>
                    {badge
                      ? <RoleBadgeIcon badge={badge} size={16} />
                      : <Ionicons name="person" size={16} color={themeColors.primary} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleLabel, { color: themeColors.text }]}>{ROLE_LABELS[role]}</Text>
                    <Text style={[styles.roleDesc, { color: themeColors.textMuted }]}>{ROLE_DESCRIPTIONS[role]}</Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={themeColors.primary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel={dialog?.confirmLabel}
        destructive={dialog?.destructive}
        onConfirm={dialog?.onConfirm ? () => {
          const run = dialog.onConfirm!;
          setDialog(null);
          run();
        } : undefined}
        onClose={() => setDialog(null)}
      />

      <FullImageModal
        visible={!!fullImageUri}
        imageUri={fullImageUri}
        title="Profile Photo"
        onClose={() => setFullImageUri(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  lockedTitle: { fontSize: 18, fontWeight: '800', marginTop: 8 },
  lockedSub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 16, marginBottom: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10, alignItems: 'center' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontWeight: '700' },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 10,
    padding: 10, borderRadius: 12, borderWidth: 1,
  },
  summaryText: { flex: 1, fontSize: 12, lineHeight: 17 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12,
    borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  name: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 1 },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, marginTop: 5,
  },
  rolePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 13 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, gap: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  sheetName: { fontSize: 16, fontWeight: '800' },
  roleOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 14, borderWidth: 1,
  },
  roleIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  roleLabel: { fontSize: 14, fontWeight: '700' },
  roleDesc: { fontSize: 11, marginTop: 2, lineHeight: 15 },
});
