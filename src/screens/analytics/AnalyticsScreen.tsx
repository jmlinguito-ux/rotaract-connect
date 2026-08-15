import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { clubs, zones } from '../../data/mockData';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Analytics'>;

export default function AnalyticsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { events, impacts, users, applications } = useData();
  const { colors: themeColors } = useTheme();
  const [selectedZone, setSelectedZone] = useState<string | 'ALL'>('ALL');

  const filteredClubs = useMemo(() => {
    if (selectedZone === 'ALL') return clubs;
    return clubs.filter(c => c.zone_id === selectedZone);
  }, [selectedZone]);

  const filteredEvents = useMemo(() => {
    if (selectedZone === 'ALL') return events;
    const clubIds = new Set(filteredClubs.map(c => c.id));
    return events.filter(e => clubIds.has(e.organizing_club_id));
  }, [events, filteredClubs, selectedZone]);

  const totalVolunteerHours = useMemo(() => {
    return impacts.reduce((acc, imp) => acc + imp.volunteer_hours, 0);
  }, [impacts]);

  const totalBeneficiaries = useMemo(() => {
    return impacts.reduce((acc, imp) => acc + imp.beneficiaries, 0);
  }, [impacts]);

  const totalFunds = useMemo(() => {
    return impacts.reduce((acc, imp) => acc + imp.funds_raised, 0);
  }, [impacts]);

  const totalVerifiedMembers = useMemo(() => {
    return users.filter(u => u.verification_status === 'VERIFIED').length;
  }, [users]);

  const pendingVerificationApps = useMemo(() => {
    return applications.filter(a => a.status.startsWith('AWAITING')).length;
  }, [applications]);

  const serviceProjectsCount = filteredEvents.filter(e => e.event_type === 'SERVICE_PROJECT').length;
  const fellowshipsCount = filteredEvents.filter(e => e.event_type === 'FELLOWSHIP').length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: themeColors.text }]}>District Analytics</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>District 3800 • Impact & Performance Overview</Text>
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
            <View style={[styles.barTrack, { backgroundColor: themeColors.surface }]}>
              <View style={[styles.barFillService, { width: `${(serviceProjectsCount / Math.max(1, filteredEvents.length)) * 100}%`, backgroundColor: themeColors.success }]} />
              <View style={[styles.barFillFellowship, { width: `${(fellowshipsCount / Math.max(1, filteredEvents.length)) * 100}%`, backgroundColor: themeColors.warning }]} />
            </View>
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
  header: { marginBottom: 16 },
  title: { fontSize: 26, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
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
