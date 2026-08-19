import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { AuditLog } from '../../types';
import { ROLE_LABELS } from '../../utils/roles';

type Props = NativeStackScreenProps<RootStackParamList, 'AuditLogs'>;
type CategoryFilter = 'ALL' | 'ROLE' | 'EVENT' | 'VERIFICATION';

const FILTERS: { key: CategoryFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'ALL', label: 'All', icon: 'layers-outline' },
  { key: 'ROLE', label: 'Roles', icon: 'shield-checkmark-outline' },
  { key: 'EVENT', label: 'Events', icon: 'calendar-outline' },
  { key: 'VERIFICATION', label: 'Verification', icon: 'checkbox-outline' },
];

export default function AuditLogsScreen({ navigation }: Props) {
  const { auditLogs } = useData();
  const { colors: themeColors, isNightMode } = useTheme();

  const [category, setCategory] = useState<CategoryFilter>('ALL');
  const [search, setSearch] = useState('');

  const filteredLogs = useMemo(() => {
    let list = auditLogs;

    if (category !== 'ALL') {
      list = list.filter(l => {
        if (category === 'ROLE') return l.category === 'ROLE' || l.action.includes('ROLE');
        if (category === 'EVENT') return l.category === 'EVENT' || l.action.includes('EVENT');
        if (category === 'VERIFICATION') return l.category === 'VERIFICATION' || !!l.application_id;
        return true;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        l =>
          l.performed_by_name?.toLowerCase().includes(q) ||
          l.target_name?.toLowerCase().includes(q) ||
          l.action?.toLowerCase().includes(q) ||
          l.notes?.toLowerCase().includes(q),
      );
    }

    return [...list].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [auditLogs, category, search]);

  const getActionBadgeColor = (action: string) => {
    if (action.includes('CANCEL')) return '#EF4444';
    if (action.includes('APPROVED') || action.includes('PUBLISHED')) return '#10B981';
    if (action.includes('ROLE')) return '#3B82F6';
    if (action.includes('VERIF')) return '#8B5CF6';
    return themeColors.primary;
  };

  const formatLogDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      {/* Header Banner */}
      <View style={[styles.headerBanner, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
        <View style={styles.bannerRow}>
          <View style={[styles.iconWrap, { backgroundColor: themeColors.primary + '18' }]}>
            <Ionicons name="finger-print" size={24} color={themeColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: themeColors.text }]}>Audit & Governance Log</Text>
            <Text style={[styles.bannerSub, { color: themeColors.textMuted }]}>
              Immutable record of role changes, event governance & approvals
            </Text>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => {
            const active = category === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? themeColors.primary : themeColors.surface,
                    borderColor: active ? themeColors.primary : themeColors.border,
                  },
                ]}
                onPress={() => setCategory(f.key)}
              >
                <Ionicons name={f.icon} size={13} color={active ? '#fff' : themeColors.textMuted} />
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? '#fff' : themeColors.textMuted, fontWeight: active ? '700' : '500' },
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <View style={[styles.searchBox, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Ionicons name="search" size={16} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search by actor, target, action or notes..."
            placeholderTextColor={themeColors.textMuted}
            value={search}
            onChangeText={setSearch}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Audit Log Timeline */}
      <FlatList
        data={filteredLogs}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="shield-checkmark-outline" size={48} color={themeColors.textMuted} />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>No Audit Logs Found</Text>
            <Text style={[styles.emptySub, { color: themeColors.textMuted }]}>
              Governance actions and verification reviews will appear here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const badgeColor = getActionBadgeColor(item.action);
          return (
            <View
              style={[
                styles.logCard,
                {
                  backgroundColor: themeColors.cardBg,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={styles.logHeader}>
                <View style={[styles.actionBadge, { backgroundColor: badgeColor + '18', borderColor: badgeColor + '40' }]}>
                  <Text style={[styles.actionBadgeText, { color: badgeColor }]}>{item.action.replace(/_/g, ' ')}</Text>
                </View>
                <Text style={[styles.timestamp, { color: themeColors.textMuted }]}>{formatLogDate(item.created_at)}</Text>
              </View>

              <View style={styles.actorRow}>
                <Text style={[styles.actorLabel, { color: themeColors.textMuted }]}>Performed by: </Text>
                <Text style={[styles.actorName, { color: themeColors.text }]}>{item.performed_by_name}</Text>
                <View style={[styles.roleChip, { backgroundColor: themeColors.surface }]}>
                  <Text style={[styles.roleChipText, { color: themeColors.textMuted }]}>
                    {ROLE_LABELS[item.performed_by_role] ?? item.performed_by_role}
                  </Text>
                </View>
              </View>

              {item.target_name && (
                <View style={styles.targetRow}>
                  <Text style={[styles.targetLabel, { color: themeColors.textMuted }]}>Target: </Text>
                  <Text style={[styles.targetName, { color: themeColors.primary }]}>{item.target_name}</Text>
                </View>
              )}

              {item.previous_status && item.new_status && (
                <View style={styles.transitionRow}>
                  <View style={[styles.statusBox, { backgroundColor: themeColors.surface }]}>
                    <Text style={[styles.statusText, { color: themeColors.textMuted }]}>{item.previous_status}</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={themeColors.textMuted} />
                  <View style={[styles.statusBox, { backgroundColor: themeColors.primary + '18' }]}>
                    <Text style={[styles.statusText, { color: themeColors.primary, fontWeight: '700' }]}>{item.new_status}</Text>
                  </View>
                </View>
              )}

              {item.notes ? (
                <Text style={[styles.notesText, { color: themeColors.textMuted }]}>
                  {item.notes}
                </Text>
              ) : null}
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBanner: { padding: 16, borderBottomWidth: 1 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 18, fontWeight: '800' },
  bannerSub: { fontSize: 11, marginTop: 2 },
  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: { fontSize: 11 },
  searchSection: { paddingHorizontal: 16, paddingTop: 12 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  listContent: { padding: 16, gap: 10 },
  logCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  actionBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  timestamp: { fontSize: 11 },
  actorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  actorLabel: { fontSize: 12 },
  actorName: { fontSize: 12, fontWeight: '700' },
  roleChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 4 },
  roleChipText: { fontSize: 10, fontWeight: '600' },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  targetLabel: { fontSize: 12 },
  targetName: { fontSize: 12, fontWeight: '700' },
  transitionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  statusBox: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11 },
  notesText: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 12, textAlign: 'center', paddingHorizontal: 30 },
});
