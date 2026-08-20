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
import {
  isAppAdmin,
  isDistrictAdmin,
  isClubPresident,
  getSystemRole,
  getClubRole,
  positionRoleLabel,
  getHighestRoleBadge,
  ROLE_LABELS,
  SYSTEM_ROLE_LABELS,
  CLUB_ROLE_LABELS,
} from '../../utils/roles';
import UserAvatar from '../../components/UserAvatar';
import FullImageModal from '../../components/FullImageModal';
import { UserProfileModal } from '../../components/UserProfileModal';
import RoleBadgeIcon from '../../components/RoleBadgeIcon';
import RotaryWheel from '../../components/RotaryWheel';
import { VerifiedName } from '../../components/VerifiedCheck';

type Props = NativeStackScreenProps<RootStackParamList, 'RoleManagement'>;

type Filter = 'ALL' | 'APP_ADMIN' | 'DISTRICT_ADMIN' | 'CLUB_PRESIDENT' | 'MEMBER';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All Users' },
  { key: 'APP_ADMIN', label: 'App Admins' },
  { key: 'DISTRICT_ADMIN', label: 'District Admins' },
  { key: 'CLUB_PRESIDENT', label: 'Presidents' },
  { key: 'MEMBER', label: 'Members' },
];

export default function RoleManagementScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { users } = useData();
  const { colors: themeColors } = useTheme();

  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);

  const callerIsAppAdmin = isAppAdmin(user);
  const callerIsDistrictAdmin = isDistrictAdmin(user);
  const hasAccess = callerIsAppAdmin || callerIsDistrictAdmin;

  const counts = useMemo(() => ({
    APP_ADMIN: users.filter(u => isAppAdmin(u)).length,
    DISTRICT_ADMIN: users.filter(u => isDistrictAdmin(u)).length,
    CLUB_PRESIDENT: users.filter(u => isClubPresident(u)).length,
    MEMBER: users.filter(u => getClubRole(u) === 'MEMBER').length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter(u => {
        if (filter === 'ALL') return true;
        if (filter === 'APP_ADMIN') return isAppAdmin(u);
        if (filter === 'DISTRICT_ADMIN') return isDistrictAdmin(u);
        if (filter === 'CLUB_PRESIDENT') return isClubPresident(u);
        if (filter === 'MEMBER') return getClubRole(u) === 'MEMBER';
        return true;
      })
      .filter(u => !q || [u.full_name, u.username, u.email, u.club_name, u.position]
        .some(field => field?.toLowerCase().includes(q)))
      .sort((a, b) => {
        // App Admins > District Admins > Presidents > Members
        const score = (u: AppUser) => (isAppAdmin(u) ? 4 : isDistrictAdmin(u) ? 3 : isClubPresident(u) ? 2 : 1);
        return score(b) - score(a) || a.full_name.localeCompare(b.full_name);
      });
  }, [users, query, filter]);

  if (!hasAccess) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
        <Ionicons name="lock-closed-outline" size={40} color={themeColors.textMuted} />
        <Text style={[styles.lockedTitle, { color: themeColors.text }]}>Governance Access Only</Text>
        <Text style={[styles.lockedSub, { color: themeColors.textMuted }]}>
          Only App Admins and District Admins can access leadership governance and manage roles.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: themeColors.primary }]}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <View style={[styles.searchWrap, { backgroundColor: themeColors.cardBg, borderColor: isSearchFocused ? themeColors.primary : themeColors.border }, isSearchFocused && { borderWidth: 1.5 }]}>
        <Ionicons name="search" size={16} color={isSearchFocused ? themeColors.primary : themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          placeholder="Search by name, club, or position..."
          placeholderTextColor={themeColors.textMuted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.auditBanner, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
        onPress={() => navigation.navigate('AuditLogs')}
      >
        <View style={styles.auditBannerLeft}>
          <Ionicons name="finger-print" size={18} color={themeColors.primary} />
          <Text style={[styles.auditBannerText, { color: themeColors.text }]}>Audit & Governance Log</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
      </TouchableOpacity>

      {/* 👑 2x2 Governance Leadership Hierarchy Grid */}
      <View style={styles.hudGrid}>
        <TouchableOpacity
          style={[
            styles.hudCard,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: filter === 'APP_ADMIN' ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => setFilter(prev => (prev === 'APP_ADMIN' ? 'ALL' : 'APP_ADMIN'))}
        >
          <View style={[styles.hudIconWrap, { backgroundColor: '#F59E0B' + '1A' }]}>
            <Ionicons name="key" size={16} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hudCount, { color: themeColors.text }]}>{counts.APP_ADMIN}</Text>
            <Text style={[styles.hudLabel, { color: themeColors.textMuted }]}>App Admins</Text>
          </View>
          {filter === 'APP_ADMIN' && <Ionicons name="checkmark-circle" size={16} color={themeColors.primary} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.hudCard,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: filter === 'DISTRICT_ADMIN' ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => setFilter(prev => (prev === 'DISTRICT_ADMIN' ? 'ALL' : 'DISTRICT_ADMIN'))}
        >
          <View style={[styles.hudIconWrap, { backgroundColor: '#3B82F6' + '1A' }]}>
            <RotaryWheel size={16} color="#3B82F6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hudCount, { color: themeColors.text }]}>{counts.DISTRICT_ADMIN}</Text>
            <Text style={[styles.hudLabel, { color: themeColors.textMuted }]}>District Admins</Text>
          </View>
          {filter === 'DISTRICT_ADMIN' && <Ionicons name="checkmark-circle" size={16} color={themeColors.primary} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.hudCard,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: filter === 'CLUB_PRESIDENT' ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => setFilter(prev => (prev === 'CLUB_PRESIDENT' ? 'ALL' : 'CLUB_PRESIDENT'))}
        >
          <View style={[styles.hudIconWrap, { backgroundColor: '#D41367' + '1A' }]}>
            <Ionicons name="star" size={16} color="#D41367" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hudCount, { color: themeColors.text }]}>{counts.CLUB_PRESIDENT}</Text>
            <Text style={[styles.hudLabel, { color: themeColors.textMuted }]}>Presidents</Text>
          </View>
          {filter === 'CLUB_PRESIDENT' && <Ionicons name="checkmark-circle" size={16} color={themeColors.primary} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.hudCard,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: filter === 'MEMBER' ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => setFilter(prev => (prev === 'MEMBER' ? 'ALL' : 'MEMBER'))}
        >
          <View style={[styles.hudIconWrap, { backgroundColor: '#10B981' + '1A' }]}>
            <Ionicons name="people" size={16} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hudCount, { color: themeColors.text }]}>{counts.MEMBER}</Text>
            <Text style={[styles.hudLabel, { color: themeColors.textMuted }]}>Members</Text>
          </View>
          {filter === 'MEMBER' && <Ionicons name="checkmark-circle" size={16} color={themeColors.primary} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
          {counts.APP_ADMIN} App Admin{counts.APP_ADMIN === 1 ? '' : 's'} • {counts.DISTRICT_ADMIN} District Admin{counts.DISTRICT_ADMIN === 1 ? '' : 's'} • {counts.CLUB_PRESIDENT} President{counts.CLUB_PRESIDENT === 1 ? '' : 's'}. Tap a user to edit system or club roles.
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={u => u.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>No users match this filter.</Text>
        }
        renderItem={({ item }) => {
          const badge = getHighestRoleBadge(item);
          const compositeSubtitle = positionRoleLabel(item.position, item);
          const isMe = user?.id === item.id;

          return (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => setSelectedUser(item)}
              activeOpacity={0.8}
            >
              <UserAvatar user={item} size={46} onPressImage={uri => setFullImageUri(uri)} />
              <View style={{ flex: 1 }}>
                <VerifiedName
                  user={{ verification_status: item.verification_status }}
                  name={`${item.full_name}${isMe ? ' (You)' : ''}`}
                  textStyle={[styles.name, { color: themeColors.text }]}
                  numberOfLines={1}
                />
                <Text style={[styles.meta, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {compositeSubtitle} • {item.club_name}
                </Text>
                <View style={[styles.rolePill, {
                  backgroundColor: (badge?.color ?? themeColors.textMuted) + '1F',
                  borderColor: (badge?.color ?? themeColors.border),
                }]}>
                  {badge ? <RoleBadgeIcon badge={badge} size={11} /> : null}
                  <Text style={[styles.rolePillText, { color: badge?.color ?? themeColors.textMuted }]}>
                    {badge?.label ?? 'Member'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          );
        }}
      />

      {/* 2-Section Role Management Profile Modal */}
      {selectedUser && (
        <UserProfileModal
          visible={!!selectedUser}
          targetUser={users.find(u => u.id === selectedUser.id) ?? selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

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
  meta: { fontSize: 12, marginTop: 2 },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, marginTop: 5,
  },
  rolePillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 13 },
  auditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  auditBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  auditBannerText: { fontSize: 13, fontWeight: '700' },
  hudGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginBottom: 12 },
  hudCard: { width: '48.5%', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1 },
  hudIconWrap: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  hudCount: { fontSize: 16, fontWeight: '800' },
  hudLabel: { fontSize: 11, marginTop: 1 },
});
