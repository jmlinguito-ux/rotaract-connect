import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Image, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { colors } from '../../theme/colors';
import { Club, AppUser } from '../../types';
import { UserProfileModal } from '../../components/UserProfileModal';
import UserAvatar from '../../components/UserAvatar';
import RotaryWheel from '../../components/RotaryWheel';
import ClubLogo from '../../components/ClubLogo';
import VerifiedCheck from '../../components/VerifiedCheck';
import { calculateParticipantHours, getRotaryYear, isDateInRotaryYear } from '../../utils/hoursCalculation';
import { zones } from '../../data/mockData';

type Props = NativeStackScreenProps<RootStackParamList, 'Scoreboard'>;
type ViewMode = 'INDIVIDUAL' | 'CLUB';
type FilterTab = 'DISTRICT' | 'ZONE' | 'MY_CLUB';
type SortMetric = 'POINTS' | 'HOURS' | 'ATTENDED';
type PeriodFilter = 'RY_2026_2027' | 'RY_2025_2026' | 'ALL_TIME';

export default function ScoreboardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { users, events, participants, clubs, impacts, getOrCreateConversation } = useData();
  const { colors: themeColors } = useTheme();

  const [viewMode, setViewMode] = useState<ViewMode>('INDIVIDUAL');
  const [tab, setTab] = useState<FilterTab>('DISTRICT');
  const [period, setPeriod] = useState<PeriodFilter>('RY_2026_2027');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [metric, setMetric] = useState<SortMetric>('POINTS');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [showFormulaInfo, setShowFormulaInfo] = useState(false);
  const insets = useSafeAreaInsets();

  const currentRY = useMemo(() => getRotaryYear(), []);

  // Available zones extracted from clubs and sorted by zone name
  const availableZones = useMemo(() => {
    const set = new Set<string>();
    clubs.forEach(c => { if (c.zone_id) set.add(c.zone_id); });
    return Array.from(set).sort((a, b) => {
      const nameA = zones.find(z => z.id === a)?.zone_name || a;
      const nameB = zones.find(z => z.id === b)?.zone_name || b;
      return nameA.localeCompare(nameB, undefined, { numeric: true });
    });
  }, [clubs]);

  const userClub = useMemo(() => clubs.find(c => c.id === user?.club_id), [clubs, user]);
  const activeZoneId = selectedZoneId || userClub?.zone_id || availableZones[0] || 'Zone 1';

  // Calculate scores and stats for individual members
  const memberScores = useMemo(() => {
    let completedEvents = events.filter(
      e => e.status === 'COMPLETED' && impacts.some(i => i.event_id === e.id),
    );

    if (period === 'RY_2026_2027') {
      completedEvents = completedEvents.filter(e =>
        isDateInRotaryYear(e.start_datetime, new Date(2026, 6, 1), new Date(2027, 5, 30, 23, 59, 59))
      );
    } else if (period === 'RY_2025_2026') {
      completedEvents = completedEvents.filter(e =>
        isDateInRotaryYear(e.start_datetime, new Date(2025, 6, 1), new Date(2026, 5, 30, 23, 59, 59))
      );
    }

    return users.map(u => {
      let totalPoints = 0;
      let totalHours = 0;
      let totalAttendedCount = 0;
      let totalOrganizedCount = 0;

      completedEvents.forEach(e => {
        const isDistrictEvent = e.event_type === 'DISTRICT_EVENT';
        const startT = new Date(e.start_datetime).getTime();
        const endT = new Date(e.end_datetime).getTime();
        const eventHours = Math.max(1, Math.round((endT - startT) / (1000 * 60 * 60)));

        // 1. Check if user is lead organizer, co-organizer, or club president of organizing club
        const isLead = e.organizer_user_id === u.id;
        const isCoOrg = e.co_organizer_user_ids && e.co_organizer_user_ids.includes(u.id);
        const isPres = u.role === 'CLUB_PRESIDENT' && u.club_id === e.organizing_club_id;

        if (isLead || isCoOrg || isPres) {
          totalOrganizedCount += 1;
          if (e.event_type === 'DISTRICT_EVENT') {
            totalPoints += 500;
          } else if (e.event_type === 'SERVICE_PROJECT') {
            totalPoints += 100;
          } else {
            totalPoints += 50; // FELLOWSHIP
          }
        }

        // 2. Check if user attended event
        const p = participants.find(part => part.event_id === e.id && part.user_id === u.id);
        const hasAttended = p && (p.attendance_status === 'ATTENDED' || !!p.checked_in_at);

        if (hasAttended) {
          const participantHours = calculateParticipantHours(p, e);
          totalAttendedCount += 1;
          totalHours += participantHours;
          let attendPts = 50;
          let hourRate = 10;

          if (e.event_type === 'DISTRICT_EVENT') {
            attendPts = 200;
            hourRate = 20;
          } else if (e.event_type === 'SERVICE_PROJECT') {
            attendPts = 50;
            hourRate = 10;
          } else if (e.event_type === 'FELLOWSHIP') {
            attendPts = 10;
            hourRate = 5;
          }

          totalPoints += attendPts + (participantHours * hourRate);
        }
      });

      const memberClub = clubs.find(c => c.id === u.club_id);

      return {
        user: u,
        club: memberClub,
        points: totalPoints,
        attendedCount: totalAttendedCount,
        organizedCount: totalOrganizedCount,
        stats: {
          joined: totalAttendedCount,
          organized: totalOrganizedCount,
          hours: totalHours,
        },
      };
    });
  }, [users, events, participants, impacts, clubs, period, currentRY]);

  // Filter and sort members
  const sortedMembers = useMemo(() => {
    let list = memberScores;

    if (tab === 'MY_CLUB' && user) {
      list = list.filter(item => item.user.club_id === user.club_id);
    } else if (tab === 'ZONE') {
      list = list.filter(item => item.club?.zone_id === activeZoneId);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        item =>
          item.user.full_name.toLowerCase().includes(q) ||
          item.user.club_name.toLowerCase().includes(q) ||
          item.user.position.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      if (metric === 'POINTS') return b.points - a.points;
      if (metric === 'HOURS') return b.stats.hours - a.stats.hours;
      if (metric === 'ATTENDED') return b.attendedCount - a.attendedCount;
      return b.points - a.points;
    });
  }, [memberScores, tab, activeZoneId, metric, search, user]);

  // Calculate aggregated club scores
  const clubScores = useMemo(() => {
    return clubs.map(c => {
      const clubMembers = memberScores.filter(m => m.user.club_id === c.id);
      const totalPoints = clubMembers.reduce((acc, m) => acc + m.points, 0);
      const totalHours = clubMembers.reduce((acc, m) => acc + m.stats.hours, 0);
      const totalAttended = clubMembers.reduce((acc, m) => acc + m.attendedCount, 0);

      return {
        club: c,
        memberCount: clubMembers.length > 0 ? clubMembers.length : c.member_count,
        totalPoints,
        totalHours,
        totalAttended,
      };
    });
  }, [clubs, memberScores]);

  // Filter and sort clubs
  const sortedClubs = useMemo(() => {
    let list = clubScores;

    if (tab === 'ZONE') {
      list = list.filter(item => item.club.zone_id === activeZoneId);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        item => item.club.club_name.toLowerCase().includes(q) || item.club.city.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      if (metric === 'POINTS') return b.totalPoints - a.totalPoints;
      if (metric === 'HOURS') return b.totalHours - a.totalHours;
      if (metric === 'ATTENDED') return b.totalAttended - a.totalAttended;
      return b.totalPoints - a.totalPoints;
    });
  }, [clubScores, tab, activeZoneId, metric, search]);

  const currentUserRank = useMemo(() => {
    if (!user) return null;
    const index = sortedMembers.findIndex(m => m.user.id === user.id);
    if (index === -1) return null;
    return { rank: index + 1, item: sortedMembers[index] };
  }, [sortedMembers, user]);

  const podiumMemberTop3 = useMemo(() => {
    return sortedMembers.slice(0, 3);
  }, [sortedMembers]);

  const podiumClubTop3 = useMemo(() => {
    return sortedClubs.slice(0, 3);
  }, [sortedClubs]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      {/* Banner Header */}
      <View style={[styles.headerBanner, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
        <View style={styles.bannerRow}>
          <View style={styles.trophyIconWrap}>
            <Ionicons name="trophy" size={28} color="#FFD700" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: themeColors.text }]}>Scoreboard</Text>
            <Text style={[styles.bannerSub, { color: themeColors.textMuted }]}>
              Points earned via volunteer hours & event check-ins
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.formulaInfoBtn, { backgroundColor: themeColors.primary + '1A' }]}
            onPress={() => setShowFormulaInfo(true)}
          >
            <Ionicons name="information-circle" size={18} color={themeColors.primary} />
            <Text style={[styles.formulaBtnText, { color: themeColors.primary }]}>Points Info</Text>
          </TouchableOpacity>
        </View>

        {/* View Mode Toggle: Individual vs Club */}
        <View style={[styles.viewToggleRow, { backgroundColor: themeColors.surface }]}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'INDIVIDUAL' && { backgroundColor: themeColors.primary }]}
            onPress={() => setViewMode('INDIVIDUAL')}
          >
            <Ionicons name="person" size={14} color={viewMode === 'INDIVIDUAL' ? '#fff' : themeColors.textMuted} />
            <Text style={[styles.viewToggleText, { color: viewMode === 'INDIVIDUAL' ? '#fff' : themeColors.textMuted }]}>
              Individual
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.viewToggleBtn, viewMode === 'CLUB' && { backgroundColor: themeColors.primary }]}
            onPress={() => setViewMode('CLUB')}
          >
            <Ionicons name="people" size={14} color={viewMode === 'CLUB' ? '#fff' : themeColors.textMuted} />
            <Text style={[styles.viewToggleText, { color: viewMode === 'CLUB' ? '#fff' : themeColors.textMuted }]}>
              By Club
            </Text>
          </TouchableOpacity>
        </View>

        {/* Period & Scope Tabs */}
        <View style={styles.filterSection}>
          {/* Rotary Year Period Selector */}
          <View style={[styles.periodToggleRow, { backgroundColor: themeColors.surface }]}>
            <TouchableOpacity
              style={[styles.periodBtn, period === 'RY_2026_2027' && { backgroundColor: themeColors.primary }]}
              onPress={() => setPeriod('RY_2026_2027')}
            >
              <Ionicons name="calendar-outline" size={13} color={period === 'RY_2026_2027' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.periodText, { color: period === 'RY_2026_2027' ? '#fff' : themeColors.textMuted }]}>
                RY 2026-2027
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodBtn, period === 'RY_2025_2026' && { backgroundColor: themeColors.primary }]}
              onPress={() => setPeriod('RY_2025_2026')}
            >
              <Ionicons name="time-outline" size={13} color={period === 'RY_2025_2026' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.periodText, { color: period === 'RY_2025_2026' ? '#fff' : themeColors.textMuted }]}>
                RY 2025-2026
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.periodBtn, period === 'ALL_TIME' && { backgroundColor: themeColors.primary }]}
              onPress={() => setPeriod('ALL_TIME')}
            >
              <Ionicons name="infinite-outline" size={13} color={period === 'ALL_TIME' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.periodText, { color: period === 'ALL_TIME' ? '#fff' : themeColors.textMuted }]}>
                All-Time
              </Text>
            </TouchableOpacity>
          </View>

          {/* Scope Tabs: District | Zone | My Club */}
          <View style={[styles.tabsRow, { backgroundColor: themeColors.surface, marginTop: 6 }]}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'DISTRICT' && { backgroundColor: themeColors.primary }]}
              onPress={() => setTab('DISTRICT')}
            >
              <Ionicons name="globe-outline" size={13} color={tab === 'DISTRICT' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.tabText, { color: tab === 'DISTRICT' ? '#fff' : themeColors.textMuted }]}>District</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, tab === 'ZONE' && { backgroundColor: themeColors.primary }]}
              onPress={() => setTab('ZONE')}
            >
              <Ionicons name="map-outline" size={13} color={tab === 'ZONE' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.tabText, { color: tab === 'ZONE' ? '#fff' : themeColors.textMuted }]}>Zone</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, tab === 'MY_CLUB' && { backgroundColor: themeColors.primary }]}
              onPress={() => setTab('MY_CLUB')}
            >
              <Ionicons name="home-outline" size={13} color={tab === 'MY_CLUB' ? '#fff' : themeColors.textMuted} />
              <Text style={[styles.tabText, { color: tab === 'MY_CLUB' ? '#fff' : themeColors.textMuted }]}>My Club</Text>
            </TouchableOpacity>
          </View>

          {/* Zone Picker Strip (visible when Zone tab active) */}
          {tab === 'ZONE' && availableZones.length > 0 && (
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={availableZones}
              keyExtractor={item => item}
              style={styles.zoneScroll}
              contentContainerStyle={styles.zoneScrollContent}
              renderItem={({ item }) => {
                const isActive = item === activeZoneId;
                const zoneObj = zones.find(z => z.id === item);
                const label = zoneObj ? zoneObj.zone_name : item;
                return (
                  <TouchableOpacity
                    style={[
                      styles.zonePill,
                      { borderColor: isActive ? themeColors.primary : themeColors.border, backgroundColor: isActive ? themeColors.primary + '18' : themeColors.surface },
                    ]}
                    onPress={() => setSelectedZoneId(item)}
                  >
                    <Text style={[styles.zonePillText, { color: isActive ? themeColors.primary : themeColors.textMuted, fontWeight: isActive ? '700' : '500' }]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>

      {/* Search & Sort Controls */}
      <View style={styles.controlsRow}>
        <View style={[styles.searchBox, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Ionicons name="search" size={16} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder={viewMode === 'INDIVIDUAL' ? 'Search member or club...' : 'Search club name or city...'}
            placeholderTextColor={themeColors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Sort Chips */}
      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: themeColors.textMuted }]}>SORT BY:</Text>
        {(
          [
            { key: 'POINTS', label: 'Points' },
            { key: 'HOURS', label: 'Hours' },
            { key: 'ATTENDED', label: 'Attended' },
          ] as { key: SortMetric; label: string }[]
        ).map(m => (
          <TouchableOpacity
            key={m.key}
            style={[
              styles.sortChip,
              {
                backgroundColor: metric === m.key ? themeColors.primary + '1F' : themeColors.surface,
                borderColor: metric === m.key ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={() => setMetric(m.key)}
          >
            <Text style={[styles.sortChipText, { color: metric === m.key ? themeColors.primary : themeColors.textMuted }]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* RENDER INDIVIDUAL MEMBERS LEADERBOARD */}
      {viewMode === 'INDIVIDUAL' && (
        <FlatList
          data={sortedMembers}
          keyExtractor={item => item.user.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            podiumMemberTop3.length >= 3 && !search ? (
              <View style={styles.podiumContainer}>
                {/* 2nd Place */}
                <TouchableOpacity
                  style={[styles.podiumCard, styles.podium2nd, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                  onPress={() => setSelectedUser(podiumMemberTop3[1].user)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.badgeMedal, { backgroundColor: '#C0C0C0' }]}>
                    <Text style={styles.medalText}>2</Text>
                  </View>
                  <Text style={[styles.podiumName, { color: themeColors.text }]} numberOfLines={1}>
                    {podiumMemberTop3[1].user.full_name.split(' ')[0]}
                  </Text>
                  <Text style={[styles.podiumPts, { color: themeColors.text }]}>{podiumMemberTop3[1].points} pts</Text>
                  <Text style={[styles.podiumSub, { color: themeColors.textMuted }]}>{podiumMemberTop3[1].stats.hours} hrs</Text>
                </TouchableOpacity>

                {/* 1st Place */}
                <TouchableOpacity
                  style={[styles.podiumCard, styles.podium1st, { backgroundColor: themeColors.cardBg }]}
                  onPress={() => setSelectedUser(podiumMemberTop3[0].user)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trophy" size={20} color="#FFD700" style={{ marginBottom: 2 }} />
                  <View style={[styles.badgeMedal, { backgroundColor: '#FFD700' }]}>
                    <Text style={styles.medalText}>1</Text>
                  </View>
                  <Text style={[styles.podiumName, { fontWeight: '800', color: themeColors.text }]} numberOfLines={1}>
                    {podiumMemberTop3[0].user.full_name.split(' ')[0]}
                  </Text>
                  <Text style={[styles.podiumPts, { color: themeColors.primary, fontSize: 16 }]}>
                    {podiumMemberTop3[0].points} pts
                  </Text>
                  <Text style={[styles.podiumSub, { color: themeColors.textMuted }]}>{podiumMemberTop3[0].stats.hours} hrs</Text>
                </TouchableOpacity>

                {/* 3rd Place */}
                <TouchableOpacity
                  style={[styles.podiumCard, styles.podium3rd, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                  onPress={() => setSelectedUser(podiumMemberTop3[2].user)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.badgeMedal, { backgroundColor: '#CD7F32' }]}>
                    <Text style={styles.medalText}>3</Text>
                  </View>
                  <Text style={[styles.podiumName, { color: themeColors.text }]} numberOfLines={1}>
                    {podiumMemberTop3[2].user.full_name.split(' ')[0]}
                  </Text>
                  <Text style={[styles.podiumPts, { color: themeColors.text }]}>{podiumMemberTop3[2].points} pts</Text>
                  <Text style={[styles.podiumSub, { color: themeColors.textMuted }]}>{podiumMemberTop3[2].stats.hours} hrs</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const isCurrentUser = user?.id === item.user.id;
            const rank = index + 1;

            return (
              <TouchableOpacity
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: isCurrentUser ? themeColors.primary + '14' : themeColors.cardBg,
                    borderColor: isCurrentUser ? themeColors.primary : themeColors.border,
                  },
                ]}
                onPress={() => setSelectedUser(item.user)}
                activeOpacity={0.8}
              >
                <View style={styles.rankBox}>
                  <Text style={[styles.rankText, { color: rank <= 3 ? themeColors.primary : themeColors.textMuted }]}>
                    #{rank}
                  </Text>
                </View>

                <UserAvatar user={item.user} size={40} />

                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.memberName, { color: themeColors.text }]} numberOfLines={1}>
                      {item.user.full_name}
                    </Text>
                    <VerifiedCheck user={item.user} size={13} />
                    {isCurrentUser && (
                      <View style={[styles.youTag, { backgroundColor: themeColors.primary }]}>
                        <Text style={styles.youTagText}>YOU</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberSub, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {item.user.position} • {item.user.club_name}
                  </Text>
                  <View style={styles.statsBreakdownRow}>
                    <Text style={[styles.statChipText, { color: themeColors.textMuted }]}>
                      {item.stats.hours} hrs • {item.attendedCount} attended • {item.stats.organized} org
                    </Text>
                  </View>
                </View>

                <View style={[styles.ptsBadge, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  <Text style={[styles.ptsValue, { color: themeColors.primary }]}>{item.points}</Text>
                  <Text style={[styles.ptsLabel, { color: themeColors.textMuted }]}>PTS</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No members found.</Text>}
        />
      )}

      {/* RENDER BY CLUB LEADERBOARD */}
      {viewMode === 'CLUB' && (
        <FlatList
          data={sortedClubs}
          keyExtractor={item => item.club.id}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            podiumClubTop3.length >= 3 && !search ? (
              <View style={styles.podiumContainer}>
                {/* 2nd Place Club */}
                <View style={[styles.podiumCard, styles.podium2nd, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <View style={[styles.badgeMedal, { backgroundColor: '#C0C0C0' }]}>
                    <Text style={styles.medalText}>2</Text>
                  </View>
                  <Text style={[styles.podiumName, { color: themeColors.text }]} numberOfLines={1}>
                    {podiumClubTop3[1].club.club_name.replace('Rotaract Club of ', '')}
                  </Text>
                  <Text style={[styles.podiumPts, { color: themeColors.text }]}>{podiumClubTop3[1].totalPoints} pts</Text>
                  <Text style={[styles.podiumSub, { color: themeColors.textMuted }]}>{podiumClubTop3[1].totalHours} hrs</Text>
                </View>

                {/* 1st Place Club */}
                <View style={[styles.podiumCard, styles.podium1st, { backgroundColor: themeColors.cardBg }]}>
                  <Ionicons name="trophy" size={20} color="#FFD700" style={{ marginBottom: 2 }} />
                  <View style={[styles.badgeMedal, { backgroundColor: '#FFD700' }]}>
                    <Text style={styles.medalText}>1</Text>
                  </View>
                  <Text style={[styles.podiumName, { fontWeight: '800', color: themeColors.text }]} numberOfLines={1}>
                    {podiumClubTop3[0].club.club_name.replace('Rotaract Club of ', '')}
                  </Text>
                  <Text style={[styles.podiumPts, { color: themeColors.primary, fontSize: 16 }]}>
                    {podiumClubTop3[0].totalPoints} pts
                  </Text>
                  <Text style={[styles.podiumSub, { color: themeColors.textMuted }]}>{podiumClubTop3[0].totalHours} hrs</Text>
                </View>

                {/* 3rd Place Club */}
                <View style={[styles.podiumCard, styles.podium3rd, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <View style={[styles.badgeMedal, { backgroundColor: '#CD7F32' }]}>
                    <Text style={styles.medalText}>3</Text>
                  </View>
                  <Text style={[styles.podiumName, { color: themeColors.text }]} numberOfLines={1}>
                    {podiumClubTop3[2].club.club_name.replace('Rotaract Club of ', '')}
                  </Text>
                  <Text style={[styles.podiumPts, { color: themeColors.text }]}>{podiumClubTop3[2].totalPoints} pts</Text>
                  <Text style={[styles.podiumSub, { color: themeColors.textMuted }]}>{podiumClubTop3[2].totalHours} hrs</Text>
                </View>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const isMyClub = user?.club_id === item.club.id;
            const rank = index + 1;

            return (
              <TouchableOpacity
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: isMyClub ? themeColors.primary + '14' : themeColors.cardBg,
                    borderColor: isMyClub ? themeColors.primary : themeColors.border,
                  },
                ]}
                onPress={() => navigation.navigate('ClubDetail', { clubId: item.club.id })}
              >
                <View style={styles.rankBox}>
                  <Text style={[styles.rankText, { color: rank <= 3 ? themeColors.primary : themeColors.textMuted }]}>
                    #{rank}
                  </Text>
                </View>

                <ClubLogo size={40} />

                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.memberName, { color: themeColors.text }]} numberOfLines={1}>
                      {item.club.club_name}
                    </Text>
                    {isMyClub && (
                      <View style={[styles.youTag, { backgroundColor: themeColors.primary }]}>
                        <Text style={styles.youTagText}>MY CLUB</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.memberSub, { color: themeColors.textMuted }]} numberOfLines={1}>
                    {item.club.city} • Pres: {item.club.president_name}
                  </Text>
                  <View style={styles.statsBreakdownRow}>
                    <Text style={[styles.statChipText, { color: themeColors.textMuted }]}>
                      {item.memberCount} members • {item.totalHours} hrs • {item.totalAttended} attendances
                    </Text>
                  </View>
                </View>

                <View style={[styles.ptsBadge, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  <Text style={[styles.ptsValue, { color: themeColors.primary }]}>{item.totalPoints}</Text>
                  <Text style={[styles.ptsLabel, { color: themeColors.textMuted }]}>PTS</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No clubs found.</Text>}
        />
      )}

      {/* Floating Bottom Bar for Current User Rank */}
      {currentUserRank && viewMode === 'INDIVIDUAL' && (
        <View style={[styles.userRankBar, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border, paddingBottom: 12 + insets.bottom }]}>
          <Ionicons name="trophy" size={18} color={themeColors.primary} />
          <Text style={[styles.userRankText, { color: themeColors.text }]}>
            Your Rank: <Text style={{ fontWeight: '800', color: themeColors.primary }}>#{currentUserRank.rank}</Text> with{' '}
            <Text style={{ fontWeight: '800', color: themeColors.primary }}>{currentUserRank.item.points} pts</Text>
          </Text>
        </View>
      )}

      <UserProfileModal
        visible={!!selectedUser}
        targetUser={selectedUser}
        onClose={() => setSelectedUser(null)}
        onStartChat={(targetUser) => {
          if (!user) return;
          const conv = getOrCreateConversation(undefined, user, targetUser.id, targetUser.full_name);
          navigation.navigate('Chat', {
            conversationId: conv.id,
            recipientId: targetUser.id,
            recipientName: targetUser.full_name,
          });
        }}
      />

      {/* Points Calculation Formula Modal Popup */}
      <Modal visible={showFormulaInfo} transparent animationType="fade" onRequestClose={() => setShowFormulaInfo(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowFormulaInfo(false)}>
          <TouchableOpacity style={[styles.formulaModalCard, { backgroundColor: themeColors.cardBg }]} activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={styles.formulaModalHeader}>
              <View style={styles.formulaModalHeaderLeft}>
                <View style={[styles.iconCircle, { backgroundColor: themeColors.primary + '1A' }]}>
                  <Ionicons name="calculator" size={20} color={themeColors.primary} />
                </View>
                <View>
                  <Text style={[styles.formulaModalTitle, { color: themeColors.text }]}>Score Calculation</Text>
                  <Text style={[styles.formulaModalSub, { color: themeColors.textMuted }]}>How scoreboard points are earned</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowFormulaInfo(false)} style={styles.closeModalBtn}>
                <Ionicons name="close" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Spacious Event Type Points Cards */}
            <View style={{ gap: 10 }}>
              {/* District Event Card */}
              <View style={[styles.typeCardBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                <View style={styles.typeCardHeader}>
                  <Ionicons name="ribbon" size={16} color="#B45309" />
                  <Text style={[styles.typeCardTitle, { color: '#78350F' }]}>District Event</Text>
                </View>
                <View style={styles.ptsPillRow}>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Organized</Text>
                    <Text style={[styles.ptsPillValue, { color: '#B45309' }]}>+500 PTS</Text>
                  </View>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Attended</Text>
                    <Text style={[styles.ptsPillValue, { color: '#B45309' }]}>+200 PTS</Text>
                  </View>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Per Hour</Text>
                    <Text style={[styles.ptsPillValue, { color: '#B45309' }]}>+20 PTS/hr</Text>
                  </View>
                </View>
              </View>

              {/* Service Project Card */}
              <View style={[styles.typeCardBox, { backgroundColor: '#EBF9F3', borderColor: colors.success }]}>
                <View style={styles.typeCardHeader}>
                  <FontAwesome5 name="hands-helping" size={14} color="#065F46" />
                  <Text style={[styles.typeCardTitle, { color: '#065F46' }]}>Service Project</Text>
                </View>
                <View style={styles.ptsPillRow}>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Organized</Text>
                    <Text style={[styles.ptsPillValue, { color: '#065F46' }]}>+100 PTS</Text>
                  </View>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Attended</Text>
                    <Text style={[styles.ptsPillValue, { color: '#065F46' }]}>+50 PTS</Text>
                  </View>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Per Hour</Text>
                    <Text style={[styles.ptsPillValue, { color: '#065F46' }]}>+10 PTS/hr</Text>
                  </View>
                </View>
              </View>

              {/* Fellowship Card */}
              <View style={[styles.typeCardBox, { backgroundColor: '#FFF4E5', borderColor: colors.warning }]}>
                <View style={styles.typeCardHeader}>
                  <Ionicons name="people" size={16} color="#9A3412" />
                  <Text style={[styles.typeCardTitle, { color: '#9A3412' }]}>Fellowship</Text>
                </View>
                <View style={styles.ptsPillRow}>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Organized</Text>
                    <Text style={[styles.ptsPillValue, { color: '#9A3412' }]}>+50 PTS</Text>
                  </View>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Attended</Text>
                    <Text style={[styles.ptsPillValue, { color: '#9A3412' }]}>+10 PTS</Text>
                  </View>
                  <View style={styles.ptsPill}>
                    <Text style={styles.ptsPillLabel}>Per Hour</Text>
                    <Text style={[styles.ptsPillValue, { color: '#9A3412' }]}>+5 PTS/hr</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Quick Rules Legend */}
            <View style={[styles.rulesLegendBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.legendRow}>
                <Ionicons name="ribbon-outline" size={15} color="#B45309" />
                <Text style={[styles.legendText, { color: themeColors.text }]}>
                  <Text style={{ fontWeight: '800' }}>Organizers:</Text> Lead Organizers, Co-Organizers & Club Presidents.
                </Text>
              </View>
              <View style={styles.legendRow}>
                <Ionicons name="checkmark-circle-outline" size={15} color={themeColors.success} />
                <Text style={[styles.legendText, { color: themeColors.text }]}>
                  <Text style={{ fontWeight: '800' }}>Attendance:</Text> Verified via GPS check-in on event day.
                </Text>
              </View>
              <View style={styles.legendRow}>
                <Ionicons name="flash-outline" size={15} color={themeColors.primary} />
                <Text style={[styles.legendText, { color: themeColors.text }]}>
                  <Text style={{ fontWeight: '800' }}>Points Release:</Text> Awarded ONLY when event is marked COMPLETED.
                </Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.gotItBtn, { backgroundColor: themeColors.primary }]} onPress={() => setShowFormulaInfo(false)}>
              <Text style={styles.gotItText}>Got It!</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBanner: { padding: 16, borderBottomWidth: 1 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  trophyIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFDF0', borderWidth: 1, borderColor: '#FFE866', alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { fontSize: 20, fontWeight: '800' },
  bannerSub: { fontSize: 12, marginTop: 2 },
  formulaInfoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  formulaBtnText: { fontSize: 11, fontWeight: '700' },
  formulaCard: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 12, gap: 8 },
  formulaHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  formulaTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  formulaItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  formulaBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  formulaPtsText: { fontSize: 10, fontWeight: '800' },
  formulaLabel: { fontSize: 12, fontWeight: '600', flex: 1 },
  viewToggleRow: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 12 },
  viewToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  viewToggleText: { fontSize: 12, fontWeight: '700' },
  filterSection: { marginTop: 8, gap: 6 },
  periodToggleRow: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 10 },
  periodBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6, borderRadius: 8 },
  periodText: { fontSize: 11, fontWeight: '700' },
  zoneScroll: { marginTop: 4 },
  zoneScrollContent: { gap: 6, paddingVertical: 2 },
  zonePill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  zonePillText: { fontSize: 11 },
  tabsRow: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8 },
  tabText: { fontSize: 12, fontWeight: '700' },
  controlsRow: { paddingHorizontal: 16, paddingTop: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  sortLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginRight: 4 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  sortChipText: { fontSize: 11, fontWeight: '700' },
  listContainer: { padding: 16, paddingTop: 4, paddingBottom: 60 },
  podiumContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 10, marginBottom: 16, marginTop: 8 },
  podiumCard: { width: '30%', borderRadius: 14, borderWidth: 1, padding: 12, alignItems: 'center' },
  podium1st: { height: 130, borderColor: '#FFD700' },
  podium2nd: { height: 110 },
  podium3rd: { height: 100 },
  badgeMedal: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  medalText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  podiumName: { fontSize: 12, fontWeight: '700' },
  podiumPts: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  podiumSub: { fontSize: 10, marginTop: 1 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  rankBox: { width: 30, alignItems: 'center' },
  rankText: { fontSize: 14, fontWeight: '700' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  clubAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  memberName: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  youTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  youTagText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  memberSub: { fontSize: 11, marginTop: 1 },
  statsBreakdownRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 3 },
  statChipText: { fontSize: 11, fontWeight: '600' },
  ptsBadge: { alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  ptsValue: { fontSize: 15, fontWeight: '800' },
  ptsLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  empty: { textAlign: 'center', marginTop: 30 },
  userRankBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderTopWidth: 1 },
  userRankText: { fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  formulaModalCard: { width: '100%', borderRadius: 20, padding: 20, gap: 14 },
  formulaModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  formulaModalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  formulaModalTitle: { fontSize: 17, fontWeight: '800' },
  formulaModalSub: { fontSize: 12, marginTop: 1 },
  closeModalBtn: { padding: 4 },
  typeCardBox: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 8 },
  typeCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeCardTitle: { fontSize: 13, fontWeight: '800' },
  ptsPillRow: { flexDirection: 'row', gap: 6 },
  ptsPill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.7)', paddingVertical: 6, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  ptsPillLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.2 },
  ptsPillValue: { fontSize: 12, fontWeight: '800', marginTop: 1 },
  rulesLegendBox: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { fontSize: 11, flex: 1, lineHeight: 15 },
  gotItBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  gotItText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
