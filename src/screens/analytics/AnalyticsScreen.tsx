import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { zones } from '../../data/mockData';
import { RootStackParamList } from '../../navigation/types';
import { exportDistrictImpactCSV } from '../../utils/csvExport';
import { AREAS_OF_FOCUS } from '../../data/areasOfFocus';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

export default function AnalyticsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { events, impacts, users, applications, clubs } = useData();
  const { colors: themeColors, isNightMode } = useTheme();
  const [selectedZone, setSelectedZone] = useState<string | 'ALL'>('ALL');

  const filteredClubs = useMemo(() => {
    if (selectedZone === 'ALL') return clubs;
    return clubs.filter(c => c.zone_id === selectedZone);
  }, [clubs, selectedZone]);

  const filteredEvents = useMemo(() => {
    if (selectedZone === 'ALL') return events;
    const clubIds = new Set(filteredClubs.map(c => c.id));
    return events.filter(e => clubIds.has(e.organizing_club_id) || e.participating_club_ids?.some(id => clubIds.has(id)));
  }, [events, filteredClubs, selectedZone]);

  const filteredImpacts = useMemo(() => {
    if (selectedZone === 'ALL') return impacts;
    const eventIds = new Set(filteredEvents.map(e => e.id));
    return impacts.filter(i => eventIds.has(i.event_id));
  }, [impacts, filteredEvents, selectedZone]);

  const totalVolunteerHours = useMemo(() => {
    return filteredImpacts.reduce((acc, imp) => acc + imp.volunteer_hours, 0);
  }, [filteredImpacts]);

  const totalBeneficiaries = useMemo(() => {
    return filteredImpacts.reduce((acc, imp) => acc + imp.beneficiaries, 0);
  }, [filteredImpacts]);

  const totalFunds = useMemo(() => {
    return filteredImpacts.reduce((acc, imp) => acc + imp.funds_raised, 0);
  }, [filteredImpacts]);

  const totalVerifiedMembers = useMemo(() => {
    return users.filter(u => u.verification_status === 'VERIFIED').length;
  }, [users]);

  const pendingVerificationApps = useMemo(() => {
    return applications.filter(a => a.status.startsWith('AWAITING')).length;
  }, [applications]);

  const serviceProjectsCount = filteredEvents.filter(e => e.event_type === 'SERVICE_PROJECT').length;
  const fellowshipsCount = filteredEvents.filter(e => e.event_type === 'FELLOWSHIP').length;

  const aofStats = useMemo(() => {
    return AREAS_OF_FOCUS.map(aof => {
      const matchingEvents = filteredEvents.filter(
        e => e.areas_of_focus && e.areas_of_focus.includes(aof.key),
      );
      const matchingEventIds = new Set(matchingEvents.map(e => e.id));
      const hours = filteredImpacts
        .filter(i => matchingEventIds.has(i.event_id))
        .reduce((sum, imp) => sum + imp.volunteer_hours, 0);

      return {
        ...aof,
        projectCount: matchingEvents.length,
        volunteerHours: hours,
        percentOfTotal: totalVolunteerHours > 0 ? (hours / totalVolunteerHours) * 100 : 0,
      };
    });
  }, [filteredEvents, filteredImpacts, totalVolunteerHours]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>District Analytics</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>District 3800 • Impact & Performance Overview</Text>
        </View>

        {/* Quick Action Toolbar */}
        <View style={styles.actionToolbar}>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            onPress={() => exportDistrictImpactCSV(filteredEvents, impacts, clubs)}
          >
            <Ionicons name="share-outline" size={16} color={themeColors.primary} />
            <Text style={[styles.exportBtnText, { color: themeColors.primary }]}>Export Impact (CSV)</Text>
          </TouchableOpacity>

          {(user?.role === 'DISTRICT_ADMIN' || user?.role === 'APP_ADMIN') && (
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
              onPress={() => navigation.navigate('AuditLogs')}
            >
              <Ionicons name="finger-print" size={16} color={themeColors.primary} />
              <Text style={[styles.exportBtnText, { color: themeColors.primary }]}>Audit Logs</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.scoreboardBanner, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
          onPress={() => navigation.navigate('Scoreboard')}
        >
          <View style={styles.scoreboardIconWrap}>
            <Ionicons name="trophy" size={24} color="#FFD700" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.scoreboardTitle, { color: themeColors.text }]}>Member Scoreboard & Leaderboard</Text>
            <Text style={[styles.scoreboardSub, { color: themeColors.textMuted }]}>View top members ranked by volunteer hours & points</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={themeColors.primary} />
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.zoneFilterRow}>
          <ZoneChip label="All Zones" active={selectedZone === 'ALL'} colors={themeColors} onPress={() => setSelectedZone('ALL')} />
          {zones.map(z => (
            <ZoneChip key={z.id} label={z.zone_name} active={selectedZone === z.id} colors={themeColors} onPress={() => setSelectedZone(z.id)} />
          ))}
        </ScrollView>

        <View style={styles.metricsGrid}>
          <MetricCard title="Volunteer Hours" value={totalVolunteerHours.toLocaleString()} icon="time" color={themeColors.primary} colors={themeColors} />
          <MetricCard title="Beneficiaries" value={totalBeneficiaries.toLocaleString()} icon="people" color={themeColors.success} colors={themeColors} />
          <MetricCard title="Funds Raised (PHP)" value={`₱${(totalFunds / 1000).toFixed(0)}k`} icon="cash" color={themeColors.warning} colors={themeColors} />
          <MetricCard title="Verified Rotaractors" value={totalVerifiedMembers.toString()} icon="shield-checkmark" color={themeColors.info} colors={themeColors} />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Event Distribution</Text>
          <View style={styles.barWrap}>
            <View style={styles.barLabelRow}>
              <Text style={[styles.barLabel, { color: themeColors.textMuted }]}>Service Projects ({serviceProjectsCount})</Text>
              <Text style={[styles.barLabel, { color: themeColors.textMuted }]}>Fellowships ({fellowshipsCount})</Text>
            </View>
            <View style={[styles.barTrack, { backgroundColor: isNightMode ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
              <View style={[styles.barFillService, { width: `${(serviceProjectsCount / Math.max(1, filteredEvents.length)) * 100}%`, backgroundColor: themeColors.success }]} />
              <View style={[styles.barFillFellowship, { width: `${(fellowshipsCount / Math.max(1, filteredEvents.length)) * 100}%`, backgroundColor: themeColors.warning }]} />
            </View>
          </View>
        </View>

        {/* 🌟 Rotary 7 Areas of Focus Impact Distribution */}
        <View style={[styles.sectionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <View style={styles.aofSectionHeader}>
            <Ionicons name="globe-outline" size={16} color={themeColors.primary} />
            <Text style={[styles.sectionTitle, { color: themeColors.text, marginBottom: 0 }]}>
              Rotary 7 Areas of Focus Impact
            </Text>
          </View>
          <Text style={[styles.aofSectionSub, { color: themeColors.textMuted }]}>
            Distribution of service projects & verified hours across Rotary International focus areas
          </Text>

          <View style={styles.aofList}>
            {aofStats.map(item => (
              <View key={item.key} style={styles.aofRow}>
                <View style={styles.aofTopRow}>
                  <View style={[styles.aofIconWrap, { backgroundColor: themeColors.primary + '18' }]}>
                    <Ionicons name={item.icon} size={15} color={themeColors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.aofLabel, { color: themeColors.text }]}>{item.label}</Text>
                  </View>
                  <View style={styles.aofMetricsGroup}>
                    <View style={[styles.aofProjectsBadge, { backgroundColor: isNightMode ? themeColors.bg : themeColors.surface }]}>
                      <Text style={[styles.aofProjectsText, { color: themeColors.text }]}>
                        {item.projectCount} proj{item.projectCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Text style={[styles.aofHoursText, { color: themeColors.primary }]}>
                      {item.volunteerHours} hrs
                    </Text>
                  </View>
                </View>
                {/* Horizontal Progress Bar */}
                <View style={[styles.aofTrack, { backgroundColor: isNightMode ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
                  <View
                    style={[
                      styles.aofFill,
                      {
                        backgroundColor: themeColors.primary,
                        width: `${Math.min(100, Math.max(item.projectCount > 0 ? 8 : 0, Math.round(item.percentOfTotal)))}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.sectionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Verification Queue Overview</Text>
          <View style={styles.queueRow}>
            <View style={styles.queueItem}>
              <Text style={[styles.queueVal, { color: themeColors.primary }]}>{pendingVerificationApps}</Text>
              <Text style={[styles.queueLbl, { color: themeColors.textMuted }]}>Awaiting Action</Text>
            </View>
            <View style={[styles.queueDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.queueItem}>
              <Text style={[styles.queueVal, { color: themeColors.primary }]}>{totalVerifiedMembers}</Text>
              <Text style={[styles.queueLbl, { color: themeColors.textMuted }]}>Active Verified</Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: themeColors.primary }]}>Club Rankings by Members</Text>
        {filteredClubs.slice(0, 5).map((club, i) => (
          <View key={club.id} style={[styles.clubRankRow, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <Text style={[styles.rankNum, { color: themeColors.primary }]}>#{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.clubName, { color: themeColors.text }]}>{club.club_name}</Text>
              <Text style={[styles.clubCity, { color: themeColors.textMuted }]}>{club.city} • President: {club.president_name}</Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: themeColors.primary + '1A' }]}>
              <Ionicons name="person" size={12} color={themeColors.primary} />
              <Text style={[styles.countText, { color: themeColors.primary }]}>{club.member_count}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ZoneChip({ label, active, colors: c, onPress }: { label: string; active: boolean; colors: any; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { backgroundColor: active ? c.primary : c.cardBg, borderColor: active ? c.primary : c.border },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : c.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function MetricCard({ title, value, icon, color, colors: c }: { title: string; value: string; icon: keyof typeof Ionicons.glyphMap; color: string; colors: any }) {
  return (
    <View style={[styles.metricCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
      <View style={[styles.iconWrap, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.metricVal, { color: c.text }]}>{value}</Text>
      <Text style={[styles.metricTitle, { color: c.textMuted }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4 },
  actionToolbar: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  exportBtnText: { fontSize: 12, fontWeight: '700' },
  scoreboardBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  scoreboardIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFDF0', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD700' },
  scoreboardTitle: { fontSize: 14, fontWeight: '800' },
  scoreboardSub: { fontSize: 11, marginTop: 2 },
  zoneFilterRow: { gap: 8, paddingBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '600' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  metricCard: { width: '48%', padding: 16, borderRadius: 14, borderWidth: 1 },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  metricVal: { fontSize: 20, fontWeight: '800' },
  metricTitle: { fontSize: 12, marginTop: 2 },
  sectionCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  barWrap: { gap: 8 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 12, fontWeight: '600' },
  barTrack: { height: 12, borderRadius: 6, flexDirection: 'row', overflow: 'hidden' },
  barFillService: { height: '100%' },
  barFillFellowship: { height: '100%' },
  aofSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  aofSectionSub: { fontSize: 12, marginBottom: 14, lineHeight: 16 },
  aofList: { gap: 12 },
  aofRow: { gap: 6 },
  aofTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aofIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  aofLabel: { fontSize: 12, fontWeight: '700' },
  aofMetricsGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aofProjectsBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  aofProjectsText: { fontSize: 10, fontWeight: '700' },
  aofHoursText: { fontSize: 11, fontWeight: '800' },
  aofTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginLeft: 36 },
  aofFill: { height: '100%', borderRadius: 3 },
  queueRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  queueItem: { flex: 1, alignItems: 'center' },
  queueVal: { fontSize: 24, fontWeight: '800' },
  queueLbl: { fontSize: 12, marginTop: 2 },
  queueDivider: { width: 1, height: 36 },
  sectionHeader: { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginBottom: 10, marginTop: 6 },
  clubRankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  rankNum: { fontSize: 14, fontWeight: '800', width: 24 },
  clubName: { fontSize: 14, fontWeight: '700' },
  clubCity: { fontSize: 12, marginTop: 1 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  countText: { fontSize: 12, fontWeight: '700' },
});
