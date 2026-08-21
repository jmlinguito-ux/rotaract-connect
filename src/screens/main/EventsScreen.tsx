import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { EventCard } from './MapScreen';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppRefreshControl } from '../../hooks/useAppRefreshControl';
import { AreaOfFocus, RotaractEvent } from '../../types';

import { visibleEvents, canApproveEvent } from '../../utils/eventApproval';
import * as Location from 'expo-location';
import { checkInWindow } from '../../utils/checkIn';
import { LocationPermissionModal } from '../../components/location/LocationPermissionModal';

type ParticipationOption = 'JOINED' | 'ATTENDED' | 'INVITED' | 'MY' | 'APPROVALS';
type StatusOption = 'ONGOING' | 'SCHEDULED' | 'RECRUITING' | 'COMPLETED';

const PARTICIPATION_LABEL: Record<ParticipationOption, string> = {
  JOINED: 'Joined Events',
  ATTENDED: 'Attended (Hours Rendered)',
  INVITED: 'Pending Invitations',
  MY: 'My Club / Organized',
  APPROVALS: 'Project Approvals',
};

const STATUS_LABEL: Record<StatusOption, string> = {
  ONGOING: 'Ongoing',
  SCHEDULED: 'Scheduled',
  RECRUITING: 'Recruiting Volunteers',
  COMPLETED: 'Completed Projects',
};

const PARTICIPATION_LIST: ParticipationOption[] = ['JOINED', 'ATTENDED', 'INVITED', 'MY'];
const STATUS_LIST: StatusOption[] = ['ONGOING', 'SCHEDULED', 'RECRUITING', 'COMPLETED'];

const AREA_LABEL: Record<AreaOfFocus, string> = {
  PEACEBUILDING: 'Peacebuilding',
  DISEASE_PREVENTION: 'Disease Prevention',
  WATER_SANITATION: 'Water & Sanitation',
  MATERNAL_CHILD_HEALTH: 'Maternal & Child Health',
  EDUCATION_LITERACY: 'Basic Education & Literacy',
  COMMUNITY_DEVELOPMENT: 'Community Development',
  ENVIRONMENT: 'Environment',
};

const ALL_AREAS: AreaOfFocus[] = [
  'PEACEBUILDING',
  'DISEASE_PREVENTION',
  'WATER_SANITATION',
  'MATERNAL_CHILD_HEALTH',
  'EDUCATION_LITERACY',
  'COMMUNITY_DEVELOPMENT',
  'ENVIRONMENT',
];

export default function EventsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { events, participants, invitations, userStats, users, clubs } = useData();
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const refreshControl = useAppRefreshControl();

  // Multi-select dropdown filters
  const [selectedParticipations, setSelectedParticipations] = useState<ParticipationOption[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<StatusOption[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<AreaOfFocus[]>([]);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Search & View Mode
  // Agenda Filter State: 'ALL' | 'MY' | 'JOINED' | 'INVITED'
  const [agendaTab, setAgendaTab] = useState<'ALL' | 'MY' | 'JOINED' | 'INVITED'>('ALL');
  const [viewMode, setViewMode] = useState<'LIST' | 'CALENDAR'>('CALENDAR');

  // Calendar State
  const [calendarMonthDate, setCalendarMonthDate] = useState<Date>(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [isGpsEnabled, setIsGpsEnabled] = useState(true);

  React.useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const services = await Location.hasServicesEnabledAsync();
        setIsGpsEnabled(status === 'granted' && services);
      } catch {
        setIsGpsEnabled(false);
      }
    })();
  }, []);

  const hasActiveEventToday = useMemo(() => {
    if (!user) return false;
    const now = new Date();
    return events.some(e => {
      const isJoined = participants.some(p => p.event_id === e.id && p.user_id === user.id && p.status === 'JOINED' && !p.checked_in_at && p.attendance_status !== 'ATTENDED');
      if (!isJoined) return false;
      return checkInWindow(e, now).state === 'OPEN';
    });
  }, [events, participants, user]);

  const stats = user ? userStats(user.id) : { joined: 0, hours: 0 };

  const myInviteCount = useMemo(() => {
    if (!user) return 0;
    return invitations.filter(i => i.invited_user_id === user.id && i.status === 'PENDING').length;
  }, [invitations, user]);

  // Only count events this user is actually allowed to see
  const pendingApprovalsCount = useMemo(() => {
    return visibleEvents(events, user, users, participants).filter(e => e.status === 'PENDING_APPROVAL').length;
  }, [events, user, users, participants]);

  // Apply Agenda Filtering (My Events vs Joined Events vs Invitations)
  const filteredEvents = useMemo(() => {
    if (!user) return visibleEvents(events, null, users, participants);

    let list = visibleEvents(events, user, users, participants);

    list = list.filter(e => {
      const isMyClubOrOrganized = e.organizing_club_id === user.club_id || e.organizer_user_id === user.id || (e.co_organizer_user_ids ?? []).includes(user.id);
      const isJoined = participants.some(p => p.event_id === e.id && p.user_id === user.id && p.status === 'JOINED');
      const isInvited = invitations.some(i => i.event_id === e.id && i.invited_user_id === user.id && i.status === 'PENDING');
      const isPendingApproval = e.status === 'PENDING_APPROVAL';
      // An event waiting on THIS user's sign-off belongs under "My" even when
      // another club organised it: as a partner or co-organising club's President
      // they are not on the organising team, so isMyClubOrOrganized misses it and
      // the event became unreachable from every tab except All — while still
      // counting toward the pending-approvals badge.
      const needsMyApproval = canApproveEvent(e, user, users, clubs);

      if (agendaTab === 'MY') return isMyClubOrOrganized || needsMyApproval;
      if (agendaTab === 'JOINED') return isJoined;
      if (agendaTab === 'INVITED') return isInvited;
      return isMyClubOrOrganized || isJoined || isInvited || isPendingApproval;
    });

    // Calendar Date Filtering (Disabled in LIST view)
    if (viewMode === 'CALENDAR' && selectedDateStr) {
      list = list.filter(e => {
        const eventStartStr = e.start_datetime.split('T')[0];
        return eventStartStr === selectedDateStr;
      });
    }

    return list;
  }, [events, users, participants, invitations, user, agendaTab, viewMode, selectedDateStr]);

  // Calendar Helper Logic
  const calendarDays = useMemo(() => {
    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: ({ dayNum: number; dateStr: string } | null)[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      days.push({ dayNum: d, dateStr: `${year}-${mStr}-${dStr}` });
    }

    return days;
  }, [calendarMonthDate]);

  const eventCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    if (!user) return map;
    visibleEvents(events, user, users, participants).forEach(e => {
      const isMyClubOrOrganized = e.organizing_club_id === user.club_id || e.organizer_user_id === user.id || (e.co_organizer_user_ids ?? []).includes(user.id);
      const isJoined = participants.some(p => p.event_id === e.id && p.user_id === user.id && p.status === 'JOINED');
      const isInvited = invitations.some(i => i.event_id === e.id && i.invited_user_id === user.id && i.status === 'PENDING');
      const isPendingApproval = e.status === 'PENDING_APPROVAL';

      let include = false;
      // Must match the list filter above, or a day shows no count while the list
      // for that same day has the event.
      if (agendaTab === 'MY') include = isMyClubOrOrganized || canApproveEvent(e, user, users, clubs);
      else if (agendaTab === 'JOINED') include = isJoined;
      else if (agendaTab === 'INVITED') include = isInvited;
      else include = isMyClubOrOrganized || isJoined || isInvited || isPendingApproval;

      if (include) {
        const dStr = e.start_datetime.split('T')[0];
        map[dStr] = (map[dStr] || 0) + 1;
      }
    });
    return map;
  }, [events, user, users, participants, invitations, agendaTab]);

  const changeMonth = (offset: number) => {
    setCalendarMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      {/* Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Events</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>
            Personal agenda & project management
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.viewModeBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            onPress={() => setViewMode(prev => (prev === 'LIST' ? 'CALENDAR' : 'LIST'))}
          >
            <Ionicons
              name={viewMode === 'LIST' ? 'calendar-outline' : 'list-outline'}
              size={20}
              color={themeColors.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: themeColors.primary }]}
            onPress={() => navigation.navigate('CreateEvent')}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Retained Filter Buttons: My Events, Joined Events & Invitations */}
      <View style={styles.tabFilterRow}>
        <TouchableOpacity
          style={[
            styles.tabFilterBtn,
            agendaTab === 'MY'
              ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
              : { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
          ]}
          onPress={() => setAgendaTab(prev => (prev === 'MY' ? 'ALL' : 'MY'))}
        >
          <Ionicons
            name="briefcase-outline"
            size={14}
            color={agendaTab === 'MY' ? '#fff' : themeColors.text}
          />
          <Text
            style={[
              styles.tabFilterText,
              { color: agendaTab === 'MY' ? '#fff' : themeColors.text },
            ]}
          >
            My Events
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabFilterBtn,
            agendaTab === 'JOINED'
              ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
              : { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
          ]}
          onPress={() => setAgendaTab(prev => (prev === 'JOINED' ? 'ALL' : 'JOINED'))}
        >
          <Ionicons
            name="people-outline"
            size={14}
            color={agendaTab === 'JOINED' ? '#fff' : themeColors.text}
          />
          <Text
            style={[
              styles.tabFilterText,
              { color: agendaTab === 'JOINED' ? '#fff' : themeColors.text },
            ]}
          >
            Joined
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabFilterBtn,
            agendaTab === 'INVITED'
              ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary }
              : { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
          ]}
          onPress={() => setAgendaTab(prev => (prev === 'INVITED' ? 'ALL' : 'INVITED'))}
        >
          <Ionicons
            name="mail-outline"
            size={14}
            color={agendaTab === 'INVITED' ? '#fff' : themeColors.text}
          />
          <Text
            style={[
              styles.tabFilterText,
              { color: agendaTab === 'INVITED' ? '#fff' : themeColors.text },
            ]}
          >
            Invites
          </Text>
          {myInviteCount > 0 && (
            <View style={[styles.badgePill, { backgroundColor: agendaTab === 'INVITED' ? '#fff' : themeColors.primary }]}>
              <Text style={[styles.badgePillText, { color: agendaTab === 'INVITED' ? themeColors.primary : '#fff' }]}>
                {myInviteCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 📍 Active Event Today & Location Disabled Notice */}
      {!isGpsEnabled && hasActiveEventToday && (
        <TouchableOpacity
          style={[styles.locationNoticeBanner, { backgroundColor: themeColors.surface, borderColor: '#FCD34D' }]}
          onPress={() => setLocationModalVisible(true)}
        >
          <Ionicons name="warning" size={16} color="#D97706" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.locationNoticeTitle, { color: '#B45309' }]}>Location Services Off</Text>
            <Text style={[styles.locationNoticeSub, { color: themeColors.textMuted }]}>
              Enable GPS to trigger automatic on-arrival check-in today.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#D97706" />
        </TouchableOpacity>
      )}

      {/* Calendar View Component */}
      {viewMode === 'CALENDAR' && (
        <View style={[styles.calendarContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          {/* Calendar Month Header */}
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthNavBtn}>
              <Ionicons name="chevron-back" size={20} color={themeColors.text} />
            </TouchableOpacity>
            <Text style={[styles.calendarMonthTitle, { color: themeColors.text }]}>
              {calendarMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthNavBtn}>
              <Ionicons name="chevron-forward" size={20} color={themeColors.text} />
            </TouchableOpacity>
          </View>

          {/* Days of Week Header */}
          <View style={styles.weekDaysRow}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <Text key={d} style={[styles.weekDayText, { color: themeColors.textMuted }]}>
                {d}
              </Text>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((item, idx) => {
              if (!item) {
                return <View key={`empty_${idx}`} style={styles.dayCellEmpty} />;
              }
              const isSelected = selectedDateStr === item.dateStr;
              const hasEvents = (eventCountByDate[item.dateStr] || 0) > 0;
              const isToday = new Date().toISOString().split('T')[0] === item.dateStr;

              return (
                <TouchableOpacity
                  key={item.dateStr}
                  style={[
                    styles.dayCell,
                    isSelected && { backgroundColor: themeColors.primary },
                    isToday && !isSelected && { borderColor: themeColors.primary, borderWidth: 1 },
                  ]}
                  onPress={() => setSelectedDateStr(prev => (prev === item.dateStr ? null : item.dateStr))}
                >
                  <Text
                    style={[
                      styles.dayNumText,
                      { color: isSelected ? '#fff' : isToday ? themeColors.primary : themeColors.text },
                    ]}
                  >
                    {item.dayNum}
                  </Text>
                  {hasEvents && (
                    <View
                      style={[
                        styles.eventDot,
                        { backgroundColor: isSelected ? '#fff' : themeColors.primary },
                      ]}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedDateStr && (
            <TouchableOpacity style={styles.resetDateBar} onPress={() => setSelectedDateStr(null)}>
              <Text style={[styles.resetDateText, { color: themeColors.primary }]}>
                Showing events for {selectedDateStr} (Tap to reset date filter)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Main Events List */}
      <FlatList
        data={filteredEvents}
        keyExtractor={i => i.id}
        refreshControl={refreshControl}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => navigation.navigate('EventDetail', { eventId: item.id })} />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>
            No events match your current filter selections.
          </Text>
        }
      />

      {/* 📍 Location Permission Modal */}
      <LocationPermissionModal
        visible={locationModalVisible}
        onClose={() => setLocationModalVisible(false)}
        onPermissionGranted={() => setIsGpsEnabled(true)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  locationNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  locationNoticeTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  locationNoticeSub: {
    fontSize: 11,
    marginTop: 1,
    lineHeight: 15,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewModeBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  fab: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tabFilterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 12 },
  tabFilterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 12, borderWidth: 1 },
  tabFilterText: { fontSize: 12, fontWeight: '700' },
  badgePill: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 },
  badgePillText: { fontSize: 10, fontWeight: '800' },
  searchRowContainer: { paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  filterDropdownTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  filterDropdownText: { fontSize: 13, fontWeight: '700' },
  activePillsRow: { paddingHorizontal: 16, marginBottom: 8 },
  activePillsScroll: { gap: 6, alignItems: 'center' },
  activePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  activePillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  clearLink: { paddingHorizontal: 8, paddingVertical: 4 },
  clearLinkText: { fontSize: 12, fontWeight: '700' },
  calendarContainer: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthNavBtn: { padding: 4 },
  calendarMonthTitle: { fontSize: 15, fontWeight: '800' },
  weekDaysRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  weekDayText: { width: '14%', textAlign: 'center', fontSize: 11, fontWeight: '700' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCellEmpty: { width: '14.28%', height: 36 },
  dayCell: { width: '14.28%', height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  dayNumText: { fontSize: 12, fontWeight: '700' },
  eventDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  resetDateBar: { marginTop: 10, alignItems: 'center', paddingVertical: 4 },
  resetDateText: { fontSize: 11, fontWeight: '700' },
  list: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  empty: { textAlign: 'center', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalBody: { paddingBottom: 20 },
  modalSectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  checkboxGrid: { gap: 8 },
  checkboxChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  checkboxLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  modalBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  modalBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  modalFooter: { flexDirection: 'row', gap: 10, paddingTop: 14, borderTopWidth: 1 },
  modalResetBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalResetText: { fontSize: 13, fontWeight: '700' },
  modalApplyBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalApplyText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
