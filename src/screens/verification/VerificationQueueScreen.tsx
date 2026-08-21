import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import UserAvatar from '../../components/UserAvatar';
import { RootStackParamList } from '../../navigation/types';
import { VerificationApplication, VerificationStatus } from '../../types';

import { isAppAdmin, isDistrictAdmin, isDistrictAreaAdmin, canGovernClub, isClubPresident } from '../../utils/roles';

type Tab = 'ALL' | VerificationStatus;

const TAB_LABEL: Record<Tab, string> = {
  ALL: 'All',
  PENDING: 'Pending',
  AWAITING_CLUB_VALIDATION: 'Club Validation',
  CLUB_VALIDATED: 'Validated',
  AWAITING_DISTRICT_VALIDATION: 'District Validation',
  AWAITING_ADMIN_VERIFICATION: 'Admin Verification',
  NEEDS_INFORMATION: 'Needs Info',
  REJECTED: 'Rejected',
  VERIFIED: 'Verified',
  SUSPENDED: 'Suspended',
};

export default function VerificationQueueScreen() {
  const { user } = useAuth();
  const { applications, clubs } = useData();
  const { colors: themeColors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<Tab>('ALL');

  const callerIsAppAdmin = isAppAdmin(user);
  const callerIsDistrictAdmin = isDistrictAdmin(user);
  const callerIsClubPres = isClubPresident(user);

  // Filter queue items based on combined system and club authorities
  const roleScope = useMemo(() => {
    if (!user) return applications;
    if (callerIsAppAdmin) return applications;
    // A District Area Admin sees the same district queue, narrowed to their own Zone.
    if (isDistrictAreaAdmin(user)) {
      return applications.filter(
        a =>
          canGovernClub(user, a.club_id, clubs) &&
          (a.position.toLowerCase().includes('president') ||
            (a.club_id === user.club_id && callerIsClubPres)),
      );
    }
    if (callerIsDistrictAdmin && callerIsClubPres) {
      return applications.filter(
        a => a.position.toLowerCase().includes('president') ||
        (a.club_id === user.club_id && !a.position.toLowerCase().includes('president'))
      );
    }
    if (callerIsDistrictAdmin) {
      return applications.filter(a => a.position.toLowerCase().includes('president'));
    }
    if (callerIsClubPres) {
      return applications.filter(
        a => a.club_id === user.club_id && !a.position.toLowerCase().includes('president')
      );
    }
    return applications;
  }, [applications, user, clubs, callerIsAppAdmin, callerIsDistrictAdmin, callerIsClubPres]);

  const visibleTabs: Tab[] = useMemo(() => {
    if (callerIsAppAdmin) {
      return ['ALL', 'AWAITING_CLUB_VALIDATION', 'AWAITING_DISTRICT_VALIDATION', 'AWAITING_ADMIN_VERIFICATION', 'VERIFIED', 'REJECTED'];
    }
    if (callerIsDistrictAdmin && callerIsClubPres) {
      return ['ALL', 'AWAITING_CLUB_VALIDATION', 'AWAITING_DISTRICT_VALIDATION', 'VERIFIED', 'REJECTED'];
    }
    if (callerIsDistrictAdmin) {
      return ['ALL', 'AWAITING_DISTRICT_VALIDATION', 'AWAITING_CLUB_VALIDATION', 'VERIFIED', 'REJECTED'];
    }
    if (callerIsClubPres) {
      return ['ALL', 'AWAITING_CLUB_VALIDATION', 'VERIFIED', 'REJECTED'];
    }
    return ['ALL', 'AWAITING_CLUB_VALIDATION', 'AWAITING_DISTRICT_VALIDATION', 'VERIFIED', 'REJECTED'];
  }, [callerIsAppAdmin, callerIsDistrictAdmin, callerIsClubPres]);

  const actionRequiredCount = useMemo(() => {
    if (callerIsAppAdmin) {
      return roleScope.filter(a => a.status.startsWith('AWAITING')).length;
    }
    if (callerIsDistrictAdmin && callerIsClubPres) {
      return roleScope.filter(
        a => (a.status === 'AWAITING_DISTRICT_VALIDATION' && a.position.toLowerCase().includes('president')) ||
             (a.status === 'AWAITING_CLUB_VALIDATION' && a.club_id === user?.club_id)
      ).length;
    }
    if (callerIsDistrictAdmin) {
      return roleScope.filter(a => a.status === 'AWAITING_DISTRICT_VALIDATION').length;
    }
    if (callerIsClubPres) {
      return roleScope.filter(a => a.status === 'AWAITING_CLUB_VALIDATION' && a.club_id === user?.club_id).length;
    }
    return 0;
  }, [roleScope, user, callerIsAppAdmin, callerIsDistrictAdmin, callerIsClubPres]);

  const list = tab === 'ALL' ? roleScope : roleScope.filter(a => a.status === tab);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <View style={[styles.summary, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
        <SummaryCell label="Total" value={roleScope.length} colors={themeColors} />
        <SummaryCell label="Action Required" value={actionRequiredCount} colors={themeColors} />
        <SummaryCell label="Verified" value={roleScope.filter(a => a.status === 'VERIFIED').length} colors={themeColors} />
      </View>

      <View style={styles.tabsWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={visibleTabs}
          keyExtractor={t => t}
          contentContainerStyle={styles.tabs}
          renderItem={({ item: t }) => {
            const active = tab === t;
            return (
              <TouchableOpacity
                onPress={() => setTab(t)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? themeColors.primary : themeColors.cardBg,
                    borderColor: active ? themeColors.primary : themeColors.border,
                  },
                ]}
              >
                <Text style={[styles.tabText, { color: active ? '#fff' : themeColors.text }]}>{TAB_LABEL[t]}</Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      <FlatList
        data={list}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <AppCard app={item} colors={themeColors} onPress={() => navigation.navigate('ApplicationReview', { applicationId: item.id })} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No applications in this queue.</Text>}
      />
    </SafeAreaView>
  );
}

function SummaryCell({ label, value, colors: c }: { label: string; value: number; colors: any }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellValue, { color: c.primary }]}>{value}</Text>
      <Text style={[styles.cellLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

function AppCard({ app, colors: c, onPress }: { app: VerificationApplication; colors: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]} onPress={onPress}>
      <UserAvatar user={{ full_name: app.full_name }} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardName, { color: c.text }]}>{app.full_name}</Text>
        <Text style={[styles.cardMeta, { color: c.textMuted }]}>{app.position} • {app.club_name}</Text>
        <View style={[
          styles.statusPill,
          {
            backgroundColor: app.status === 'VERIFIED' ? c.primary + '1F' : app.status === 'REJECTED' ? c.danger + '1F' : '#6B72801F',
            borderColor: app.status === 'VERIFIED' ? c.primary + '3D' : app.status === 'REJECTED' ? c.danger + '3D' : '#6B72803D',
            borderWidth: 1,
          },
        ]}>
          <Text style={[
            styles.statusText,
            { color: app.status === 'VERIFIED' ? c.primary : app.status === 'REJECTED' ? c.danger : '#6B7280' },
          ]}>
            {app.status === 'VERIFIED' ? 'VERIFIED' : app.status === 'REJECTED' ? 'REJECTED' : 'UNVERIFIED'}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  summary: { flexDirection: 'row', margin: 16, borderRadius: 14, borderWidth: 1, padding: 16 },
  cell: { flex: 1, alignItems: 'center' },
  cellValue: { fontSize: 22, fontWeight: '800' },
  cellLabel: { fontSize: 12, marginTop: 2 },
  tabsWrap: { marginBottom: 8 },
  tabs: { paddingHorizontal: 16, gap: 8 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 1 },
  tabText: { fontSize: 12, fontWeight: '700' },
  list: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700' },
  cardName: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 6 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  empty: { textAlign: 'center', marginTop: 40 },
});
