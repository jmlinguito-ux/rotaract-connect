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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { zones } from '../../data/mockData';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppRefreshControl } from '../../hooks/useAppRefreshControl';
import { AppUser, VerificationApplication } from '../../types';
import { BottomSheet } from '../../components/BottomSheet';
import UserAvatar from '../../components/UserAvatar';
import RotaryWheel from '../../components/RotaryWheel';
import ClubLogo from '../../components/ClubLogo';
import { VerifiedName } from '../../components/VerifiedCheck';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { callNumber, sendEmail } from '../../utils/contactLinks';
import { openNavigationApp } from '../../utils/navigationLauncher';
import { useToast } from '../../context/ToastContext';

type SearchTab = 'CLUBS' | 'MEMBERS' | 'REQUESTS';

const PROVINCES = [
  'Metro Manila (NCR)',
  'Rizal',
];

const CITIES_BY_PROVINCE: Record<string, string[]> = {
  'Metro Manila (NCR)': [
    'Valenzuela',
    'Malabon',
    'Caloocan',
    'Navotas',
    'Marikina',
    'Pasig',
    'Mandaluyong',
    'San Juan',
  ],
  'Rizal': [
    'Angono',
    'Antipolo',
    'Baras',
    'Binangonan',
    'Cainta',
    'Cardona',
    'Jalajala',
    'Morong',
    'Pililla',
    'Rodriguez (Montalban)',
    'San Mateo',
    'Tanay',
    'Taytay',
    'Teresa',
  ],
};

export default function ClubsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { clubs, users, getOrCreateConversation, addClub, applicationsForRole, removeUser } = useData();
  const { colors: themeColors, isNightMode } = useTheme();
  const { showToast } = useToast();
  const refreshControl = useAppRefreshControl();

  const isAppAdmin = user?.role === 'APP_ADMIN';
  const [memberToRemove, setMemberToRemove] = useState<AppUser | null>(null);

  const [q, setQ] = useState('');
  const [zoneId, setZoneId] = useState<string | 'ALL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'COMMUNITY' | 'INSTITUTION'>('ALL');
  const [activeTab, setActiveTab] = useState<SearchTab>('CLUBS');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Add Club Modal State
  const [isAddClubModalOpen, setIsAddClubModalOpen] = useState(false);
  const [newClubIdInput, setNewClubIdInput] = useState('');
  const [newClubName, setNewClubName] = useState('');
  const [newClubEmail, setNewClubEmail] = useState('');
  const [newClubMeetingAddress, setNewClubMeetingAddress] = useState('');
  const [newClubCity, setNewClubCity] = useState('');
  const [newClubProvince, setNewClubProvince] = useState('');
  const [newClubZoneId, setNewClubZoneId] = useState('z1');
  const [newClubPresident, setNewClubPresident] = useState('');
  const [isProvinceDropdownOpen, setIsProvinceDropdownOpen] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);

  const isDistrictAdmin = user?.role === 'DISTRICT_ADMIN' || user?.role === 'APP_ADMIN';

  const activeFilterCount = (zoneId !== 'ALL' ? 1 : 0) + (typeFilter !== 'ALL' ? 1 : 0);

  // District Admin Review Requests — only applications still needing a decision.
  // Once approved (VERIFIED) or rejected, they leave the Requests bucket.
  const pendingRequests = useMemo(() => {
    if (!user || !isDistrictAdmin) return [];
    return applicationsForRole(user.role).filter(
      a => a.status !== 'VERIFIED' && a.status !== 'REJECTED'
    );
  }, [user, isDistrictAdmin, applicationsForRole]);

  // Filter Clubs by zone, name, city, president, or member match
  const filteredClubs = useMemo(() => {
    const query = q.toLowerCase().trim();
    return clubs.filter(c => {
      if (zoneId !== 'ALL' && c.zone_id !== zoneId) return false;
      if (typeFilter === 'COMMUNITY' && c.club_type === 'INSTITUTION_BASED') return false;
      if (typeFilter === 'INSTITUTION' && c.club_type !== 'INSTITUTION_BASED') return false;
      if (!query) return true;

      const nameMatch = c.club_name.toLowerCase().includes(query);
      const cityMatch = c.city.toLowerCase().includes(query);
      const presidentMatch = c.president_name.toLowerCase().includes(query);
      const instMatch = c.institution_name?.toLowerCase().includes(query);
      const addressMatch = c.meeting_address?.toLowerCase().includes(query);
      const memberMatch = users.some(u => u.club_id === c.id && u.full_name.toLowerCase().includes(query));

      return nameMatch || cityMatch || presidentMatch || instMatch || addressMatch || memberMatch;
    });
  }, [clubs, users, q, zoneId, typeFilter]);

  // Filter Members by name, club, position, or username
  const filteredMembers = useMemo(() => {
    const query = q.toLowerCase().trim();
    return users.filter(u => {
      const memberClub = clubs.find(c => c.id === u.club_id);
      if (zoneId !== 'ALL' && memberClub?.zone_id !== zoneId) return false;
      if (!query) return true;

      return (
        u.full_name.toLowerCase().includes(query) ||
        u.club_name.toLowerCase().includes(query) ||
        u.position.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query)
      );
    });
  }, [users, clubs, q, zoneId]);

  // Filter Requests by query
  const filteredRequests = useMemo(() => {
    const query = q.toLowerCase().trim();
    if (!query) return pendingRequests;
    return pendingRequests.filter(r =>
      r.full_name.toLowerCase().includes(query) ||
      r.club_name.toLowerCase().includes(query) ||
      r.position.toLowerCase().includes(query) ||
      r.email.toLowerCase().includes(query)
    );
  }, [pendingRequests, q]);

  const handleChatWithMember = (targetUser: AppUser) => {
    if (!user) return;
    const conv = getOrCreateConversation(undefined, user, targetUser.id, targetUser.full_name);
    navigation.navigate('Chat', {
      conversationId: conv.id,
      recipientId: targetUser.id,
      recipientName: targetUser.full_name,
    });
  };

  const handleCreateClub = () => {
    if (!newClubIdInput.trim() || !newClubName.trim() || !newClubCity.trim() || !newClubProvince.trim()) {
      Alert.alert('Missing Fields', 'Please fill in Club ID, Club Name, City / Municipality, and Province / Region.');
      return;
    }

    addClub({
      club_code: newClubIdInput.trim(),
      club_name: newClubName.trim(),
      email: newClubEmail.trim() || undefined,
      meeting_address: newClubMeetingAddress.trim() || undefined,
      city: newClubCity.trim(),
      province: newClubProvince.trim(),
      zone_id: newClubZoneId,
      president_name: newClubPresident.trim() || 'Pending Election',
    });

    Alert.alert('Club Created', `"${newClubName.trim()}" (ID: ${newClubIdInput.trim()}) has been successfully added to District 3800.`);
    setIsAddClubModalOpen(false);
    setNewClubIdInput('');
    setNewClubName('');
    setNewClubEmail('');
    setNewClubMeetingAddress('');
    setNewClubCity('');
    setNewClubProvince('');
    setNewClubPresident('');
    setActiveTab('CLUBS');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      {/* Header with District Admin Add Club circular FAB button */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Clubs & Members</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>
            District 3800 • {clubs.length} clubs • {users.length} members
          </Text>
        </View>

        {isDistrictAdmin && (
          <TouchableOpacity
            style={[styles.fab, { backgroundColor: themeColors.primary }]}
            onPress={() => setIsAddClubModalOpen(true)}
            accessibilityLabel="Add Club"
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search Bar + Filter Trigger Row */}
      <View style={styles.searchRow}>
        <View style={[styles.searchWrap, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Ionicons name="search" size={18} color={themeColors.textMuted} />
          <TextInput
            style={[styles.search, { color: themeColors.text }]}
            placeholder={
              activeTab === 'CLUBS'
                ? 'Search clubs, cities, or meeting venues…'
                : activeTab === 'MEMBERS'
                ? 'Search members, clubs, or positions…'
                : 'Search pending requests…'
            }
            placeholderTextColor={themeColors.textMuted}
            value={q}
            onChangeText={setQ}
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ('')}>
              <Ionicons name="close-circle" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {activeTab !== 'REQUESTS' && (
          <TouchableOpacity
            style={[
              styles.filterBtn,
              {
                backgroundColor: activeFilterCount > 0 ? themeColors.primary + '1A' : themeColors.cardBg,
                borderColor: activeFilterCount > 0 ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={() => setIsFilterModalOpen(true)}
          >
            <Ionicons
              name="funnel-outline"
              size={18}
              color={activeFilterCount > 0 ? themeColors.primary : themeColors.textMuted}
            />
            {activeFilterCount > 0 && (
              <View style={[styles.filterCountBadge, { backgroundColor: themeColors.primary }]}>
                <Text style={styles.filterCountBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Segmented Control: Clubs | Members | (Requests if District Admin) */}
      <View style={styles.segmentedRow}>
        <TouchableOpacity
          style={[
            styles.segmentBtn,
            {
              backgroundColor: activeTab === 'CLUBS' ? themeColors.primary + '1A' : themeColors.cardBg,
              borderColor: activeTab === 'CLUBS' ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => setActiveTab('CLUBS')}
        >
          <RotaryWheel size={15} color={activeTab === 'CLUBS' ? themeColors.primary : themeColors.textMuted} />
          <Text style={[styles.segmentText, { color: activeTab === 'CLUBS' ? themeColors.primary : themeColors.textMuted }]}>
            Clubs ({filteredClubs.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.segmentBtn,
            {
              backgroundColor: activeTab === 'MEMBERS' ? themeColors.primary + '1A' : themeColors.cardBg,
              borderColor: activeTab === 'MEMBERS' ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => setActiveTab('MEMBERS')}
        >
          <Ionicons name="people" size={15} color={activeTab === 'MEMBERS' ? themeColors.primary : themeColors.textMuted} />
          <Text style={[styles.segmentText, { color: activeTab === 'MEMBERS' ? themeColors.primary : themeColors.textMuted }]}>
            Members ({filteredMembers.length})
          </Text>
        </TouchableOpacity>

        {isDistrictAdmin && (
          <TouchableOpacity
            style={[
              styles.segmentBtn,
              {
                backgroundColor: activeTab === 'REQUESTS' ? themeColors.primary + '1A' : themeColors.cardBg,
                borderColor: activeTab === 'REQUESTS' ? themeColors.primary : themeColors.border,
              },
            ]}
            onPress={() => setActiveTab('REQUESTS')}
          >
            <Ionicons name="shield-checkmark" size={15} color={activeTab === 'REQUESTS' ? themeColors.primary : themeColors.textMuted} />
            <Text style={[styles.segmentText, { color: activeTab === 'REQUESTS' ? themeColors.primary : themeColors.textMuted }]}>
              Requests ({filteredRequests.length})
            </Text>
            {pendingRequests.length > 0 && (
              <View style={[styles.badgeDot, { backgroundColor: themeColors.danger }]} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Active Filters Pill Row (Clean and compact, only shown if filters active) */}
      {activeFilterCount > 0 && activeTab !== 'REQUESTS' && (
        <View style={styles.activeFiltersRow}>
          {zoneId !== 'ALL' && (
            <TouchableOpacity
              style={[styles.activeFilterChip, { backgroundColor: themeColors.primary }]}
              onPress={() => setZoneId('ALL')}
            >
              <Text style={styles.activeFilterChipText}>
                {zones.find(z => z.id === zoneId)?.zone_name || zoneId}
              </Text>
              <Ionicons name="close-circle" size={14} color="#fff" />
            </TouchableOpacity>
          )}
          {typeFilter !== 'ALL' && (
            <TouchableOpacity
              style={[styles.activeFilterChip, { backgroundColor: themeColors.primary }]}
              onPress={() => setTypeFilter('ALL')}
            >
              <Text style={styles.activeFilterChipText}>
                {typeFilter === 'COMMUNITY' ? 'Community' : 'University'}
              </Text>
              <Ionicons name="close-circle" size={14} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => {
              setZoneId('ALL');
              setTypeFilter('ALL');
            }}
            style={styles.resetFilterBtn}
          >
            <Text style={[styles.resetFilterText, { color: themeColors.primary }]}>Reset</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results List */}
      {activeTab === 'CLUBS' ? (
        <FlatList
          data={filteredClubs}
          keyExtractor={i => i.id}
          refreshControl={refreshControl}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const zone = zones.find(z => z.id === item.zone_id);
            const memberCount = users.filter(u => u.club_id === item.id).length || item.member_count;
            const presUser = users.find(u => u.id === item.president_id || (u.club_id === item.id && u.role === 'CLUB_PRESIDENT'));
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                onPress={() => navigation.navigate('ClubDetail', { clubId: item.id })}
              >
                <ClubLogo size={48} />
                <View style={{ flex: 1 }}>
                  <View style={styles.clubTitleRow}>
                    <Text style={[styles.name, { color: themeColors.text, flexShrink: 1 }]}>{item.club_name}</Text>
                    <View
                      style={[
                        styles.typeBadge,
                        item.club_type === 'INSTITUTION_BASED'
                          ? { backgroundColor: '#EDE9FE', borderColor: '#8B5CF6' }
                          : { backgroundColor: '#E0F2FE', borderColor: '#0284C7' },
                      ]}
                    >
                      <Ionicons
                        name={item.club_type === 'INSTITUTION_BASED' ? 'school' : 'business'}
                        size={10}
                        color={item.club_type === 'INSTITUTION_BASED' ? '#6D28D9' : '#0369A1'}
                      />
                      <Text
                        style={[
                          styles.typeBadgeText,
                          { color: item.club_type === 'INSTITUTION_BASED' ? '#6D28D9' : '#0369A1' },
                        ]}
                      >
                        {item.club_type === 'INSTITUTION_BASED' ? 'University' : 'Community'}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.meta, { color: themeColors.textMuted }]}>
                    {zone?.zone_name} • {item.city}
                    {item.institution_name ? ` • ${item.institution_name}` : ''}
                  </Text>

                  {item.meeting_address ? (
                    <View style={styles.addressMetaRow}>
                      <Ionicons name="location-outline" size={11} color={themeColors.primary} />
                      <Text style={[styles.addressMetaText, { color: themeColors.text }]} numberOfLines={1}>
                        {item.meeting_address}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={[styles.metaSmall, { color: themeColors.textMuted }]}>
                    {memberCount} members • Pres: {item.president_name}
                  </Text>

                  {/* Quick Actions Row: Email Club & Meeting Venue */}
                  <View style={styles.quickActionRow}>
                    <TouchableOpacity
                      style={[styles.quickActionBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        const targetEmail = item.email || presUser?.email;
                        if (targetEmail) {
                          sendEmail(targetEmail);
                        } else {
                          showToast({
                            type: 'info',
                            title: 'Email Unlisted',
                            message: 'Club/President email address is not publicly listed.',
                          });
                        }
                      }}
                    >
                      <Ionicons name="mail-outline" size={12} color={themeColors.primary} />
                      <Text style={[styles.quickActionText, { color: themeColors.primary }]}>Email</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickActionBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
                      onPress={(e) => {
                        e.stopPropagation();
                        openNavigationApp(
                          item.latitude,
                          item.longitude,
                          item.club_name,
                          item.meeting_address || `${item.city}, ${item.province}`
                        );
                      }}
                    >
                      <Ionicons name="navigate-outline" size={12} color={themeColors.primary} />
                      <Text style={[styles.quickActionText, { color: themeColors.primary }]}>Venue</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No clubs match your search.</Text>}
        />
      ) : activeTab === 'MEMBERS' ? (
        <FlatList
          data={filteredMembers}
          keyExtractor={i => i.id}
          refreshControl={refreshControl}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                onPress={() => handleChatWithMember(item)}
              >
                <UserAvatar user={item} size={48} />
                <View style={{ flex: 1 }}>
                  <VerifiedName
                    user={item}
                    textStyle={[styles.name, { color: themeColors.text }]}
                    numberOfLines={1}
                  />
                  <Text style={[styles.meta, { color: themeColors.textMuted }]}>{item.position}</Text>
                  <Text style={[styles.metaSmall, { color: themeColors.textMuted }]}>{item.club_name}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.chatIconBtn, { backgroundColor: themeColors.primary + '1A', borderColor: themeColors.primary + '3D' }]}
                  onPress={() => handleChatWithMember(item)}
                >
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={themeColors.primary} />
                </TouchableOpacity>
                {isAppAdmin && item.id !== user?.id && (
                  <TouchableOpacity
                    style={[styles.chatIconBtn, { backgroundColor: themeColors.danger + '1A', borderColor: themeColors.danger + '3D' }]}
                    onPress={() => setMemberToRemove(item)}
                  >
                    <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No members match your search.</Text>}
        />
      ) : (
        /* District Admin Review Requests List */
        <FlatList
          data={filteredRequests}
          keyExtractor={i => i.id}
          refreshControl={refreshControl}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <RequestCard
              app={item}
              colors={themeColors}
              onPress={() => navigation.navigate('ApplicationReview', { applicationId: item.id })}
            />
          )}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: themeColors.textMuted }]}>
              No pending review requests.
            </Text>
          }
        />
      )}

      {/* Filter BottomSheet */}
      <BottomSheet
        visible={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        cardStyle={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: themeColors.text }]}>Filters</Text>
          <TouchableOpacity onPress={() => setIsFilterModalOpen(false)}>
            <Ionicons name="close" size={24} color={themeColors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
          {/* Zone Filter */}
          <Text style={[styles.filterSectionTitle, { color: themeColors.text }]}>Zone</Text>
          <View style={styles.filterChipGrid}>
            <TouchableOpacity
              style={[
                styles.filterModalChip,
                {
                  backgroundColor: zoneId === 'ALL' ? themeColors.primary : themeColors.bg,
                  borderColor: zoneId === 'ALL' ? themeColors.primary : themeColors.border,
                },
              ]}
              onPress={() => setZoneId('ALL')}
            >
              <Text style={[styles.filterModalChipText, { color: zoneId === 'ALL' ? '#fff' : themeColors.text }]}>
                All Zones
              </Text>
            </TouchableOpacity>
            {zones.map(z => (
              <TouchableOpacity
                key={z.id}
                style={[
                  styles.filterModalChip,
                  {
                    backgroundColor: zoneId === z.id ? themeColors.primary : themeColors.bg,
                    borderColor: zoneId === z.id ? themeColors.primary : themeColors.border,
                  },
                ]}
                onPress={() => setZoneId(z.id)}
              >
                <Text style={[styles.filterModalChipText, { color: zoneId === z.id ? '#fff' : themeColors.text }]}>
                  {z.zone_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Charter Type Filter (only relevant for Clubs) */}
          {activeTab === 'CLUBS' && (
            <>
              <Text style={[styles.filterSectionTitle, { color: themeColors.text, marginTop: 16 }]}>
                Club Type
              </Text>
              <View style={styles.filterChipGrid}>
                <TouchableOpacity
                  style={[
                    styles.filterModalChip,
                    {
                      backgroundColor: typeFilter === 'ALL' ? themeColors.primary : themeColors.bg,
                      borderColor: typeFilter === 'ALL' ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => setTypeFilter('ALL')}
                >
                  <Text style={[styles.filterModalChipText, { color: typeFilter === 'ALL' ? '#fff' : themeColors.text }]}>
                    All Types
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filterModalChip,
                    {
                      backgroundColor: typeFilter === 'COMMUNITY' ? themeColors.primary : themeColors.bg,
                      borderColor: typeFilter === 'COMMUNITY' ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => setTypeFilter('COMMUNITY')}
                >
                  <Text style={[styles.filterModalChipText, { color: typeFilter === 'COMMUNITY' ? '#fff' : themeColors.text }]}>
                    Community-Based
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.filterModalChip,
                    {
                      backgroundColor: typeFilter === 'INSTITUTION' ? themeColors.primary : themeColors.bg,
                      borderColor: typeFilter === 'INSTITUTION' ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => setTypeFilter('INSTITUTION')}
                >
                  <Text style={[styles.filterModalChipText, { color: typeFilter === 'INSTITUTION' ? '#fff' : themeColors.text }]}>
                    University-Based
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.filterModalActions}>
          <TouchableOpacity
            style={[styles.filterResetBtn, { borderColor: themeColors.border }]}
            onPress={() => {
              setZoneId('ALL');
              setTypeFilter('ALL');
              setIsFilterModalOpen(false);
            }}
          >
            <Text style={[styles.filterResetBtnText, { color: themeColors.text }]}>Reset All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterApplyBtn, { backgroundColor: themeColors.primary }]}
            onPress={() => setIsFilterModalOpen(false)}
          >
            <Text style={styles.filterApplyBtnText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Add Club BottomSheet */}
      <BottomSheet
        visible={isAddClubModalOpen}
        onClose={() => {
          setIsAddClubModalOpen(false);
          setIsProvinceDropdownOpen(false);
          setIsCityDropdownOpen(false);
          setIsZoneDropdownOpen(false);
        }}
        cardStyle={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: themeColors.text }]}>Add New Rotaract Club</Text>
          <TouchableOpacity onPress={() => setIsAddClubModalOpen(false)}>
            <Ionicons name="close" size={24} color={themeColors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.modalBody}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. Club Name */}
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Club Name *</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="e.g. Rotaract Club of Pasig"
            placeholderTextColor={themeColors.textMuted}
            value={newClubName}
            onChangeText={setNewClubName}
          />

          {/* 2. Club ID */}
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Club ID *</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="e.g. 21543"
            placeholderTextColor={themeColors.textMuted}
            value={newClubIdInput}
            onChangeText={text => setNewClubIdInput(text.replace(/[^0-9]/g, ''))}
            keyboardType="numeric"
          />

          {/* 3. Club Email Address */}
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Club Email Address</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="e.g. rotaract.pasig@district3800.org"
            placeholderTextColor={themeColors.textMuted}
            value={newClubEmail}
            onChangeText={setNewClubEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {/* 4. Meeting Place Address */}
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Meeting Place Address / Venue Pin</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="e.g. Pasig City Hall Activity Center, Caruncho Ave"
            placeholderTextColor={themeColors.textMuted}
            value={newClubMeetingAddress}
            onChangeText={setNewClubMeetingAddress}
          />

          {/* 5. President Name */}
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>President Name</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="e.g. Juan Dela Cruz"
            placeholderTextColor={themeColors.textMuted}
            value={newClubPresident}
            onChangeText={setNewClubPresident}
          />

          {/* 6. Province / Region Selector */}
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Province / Region *</Text>
            <TouchableOpacity
              style={[styles.modalSelector, { backgroundColor: themeColors.bg, borderColor: isProvinceDropdownOpen ? themeColors.primary : themeColors.border }]}
              onPress={() => {
                setIsProvinceDropdownOpen(!isProvinceDropdownOpen);
                setIsCityDropdownOpen(false);
                setIsZoneDropdownOpen(false);
              }}
            >
              <Text style={newClubProvince ? [styles.selectorText, { color: themeColors.text }] : [styles.selectorPlaceholder, { color: themeColors.textMuted }]}>
                {newClubProvince || 'Select Province / Region'}
              </Text>
              <Ionicons name={isProvinceDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={themeColors.textMuted} />
            </TouchableOpacity>

            {isProvinceDropdownOpen && (
              <View style={[styles.inlineDropdownMenu, { backgroundColor: isNightMode ? themeColors.surface : '#F8FAFC', borderColor: themeColors.border }]}>
                <ScrollView
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  style={{ maxHeight: 180 }}
                >
                  {PROVINCES.map(p => {
                    const isSelected = newClubProvince === p;
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.overlayDropdownItem, isSelected && { backgroundColor: themeColors.primary + '14' }]}
                        onPress={() => {
                          setNewClubProvince(p);
                          setIsProvinceDropdownOpen(false);
                          const cities = CITIES_BY_PROVINCE[p] || [];
                          if (!cities.includes(newClubCity)) {
                            setNewClubCity('');
                          }
                        }}
                      >
                        <View style={styles.checkmarkWrap}>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={18} color={themeColors.primary} />
                          ) : (
                            <Ionicons name="ellipse-outline" size={14} color={themeColors.textMuted} />
                          )}
                        </View>
                        <Text style={[styles.overlayDropdownText, { color: isSelected ? themeColors.primary : themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{p}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* 7. City / Municipality Selector */}
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>City / Municipality *</Text>
            <TouchableOpacity
              style={[styles.modalSelector, { backgroundColor: themeColors.bg, borderColor: isCityDropdownOpen ? themeColors.primary : themeColors.border }]}
              onPress={() => {
                if (!newClubProvince) {
                  setNewClubProvince('Metro Manila (NCR)');
                }
                setIsCityDropdownOpen(!isCityDropdownOpen);
                setIsProvinceDropdownOpen(false);
                setIsZoneDropdownOpen(false);
              }}
            >
              <Text style={newClubCity ? [styles.selectorText, { color: themeColors.text }] : [styles.selectorPlaceholder, { color: themeColors.textMuted }]}>
                {newClubCity || 'Select City / Municipality'}
              </Text>
              <Ionicons name={isCityDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={themeColors.textMuted} />
            </TouchableOpacity>

            {isCityDropdownOpen && (
              <View style={[styles.inlineDropdownMenu, { backgroundColor: isNightMode ? themeColors.surface : '#F8FAFC', borderColor: themeColors.border }]}>
                <ScrollView
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  style={{ maxHeight: 200 }}
                >
                  {(CITIES_BY_PROVINCE[newClubProvince || 'Metro Manila (NCR)'] || []).map(c => {
                    const isSelected = newClubCity === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.overlayDropdownItem, isSelected && { backgroundColor: themeColors.primary + '14' }]}
                        onPress={() => {
                          setNewClubCity(c);
                          setIsCityDropdownOpen(false);
                        }}
                      >
                        <View style={styles.checkmarkWrap}>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={18} color={themeColors.primary} />
                          ) : (
                            <Ionicons name="ellipse-outline" size={14} color={themeColors.textMuted} />
                          )}
                        </View>
                        <Text style={[styles.overlayDropdownText, { color: isSelected ? themeColors.primary : themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* 8. Zone Dropdown */}
          <View style={{ marginBottom: 12 }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Zone *</Text>
            <TouchableOpacity
              style={[styles.modalSelector, { backgroundColor: themeColors.bg, borderColor: isZoneDropdownOpen ? themeColors.primary : themeColors.border }]}
              onPress={() => {
                setIsZoneDropdownOpen(!isZoneDropdownOpen);
                setIsProvinceDropdownOpen(false);
                setIsCityDropdownOpen(false);
              }}
            >
              <Text style={newClubZoneId ? [styles.selectorText, { color: themeColors.text }] : [styles.selectorPlaceholder, { color: themeColors.textMuted }]}>
                {zones.find(z => z.id === newClubZoneId)?.zone_name || 'Select Zone'}
              </Text>
              <Ionicons name={isZoneDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={themeColors.textMuted} />
            </TouchableOpacity>

            {isZoneDropdownOpen && (
              <View style={[styles.inlineDropdownMenu, { backgroundColor: isNightMode ? themeColors.surface : '#F8FAFC', borderColor: themeColors.border }]}>
                <ScrollView
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  style={{ maxHeight: 180 }}
                >
                  {zones.map(z => {
                    const isSelected = newClubZoneId === z.id;
                    return (
                      <TouchableOpacity
                        key={z.id}
                        style={[styles.overlayDropdownItem, isSelected && { backgroundColor: themeColors.primary + '14' }]}
                        onPress={() => {
                          setNewClubZoneId(z.id);
                          setIsZoneDropdownOpen(false);
                        }}
                      >
                        <View style={styles.checkmarkWrap}>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={18} color={themeColors.primary} />
                          ) : (
                            <Ionicons name="ellipse-outline" size={14} color={themeColors.textMuted} />
                          )}
                        </View>
                        <Text style={[styles.overlayDropdownText, { color: isSelected ? themeColors.primary : themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{z.zone_name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
            onPress={() => setIsAddClubModalOpen(false)}
          >
            <Text style={[styles.modalCancelBtnText, { color: themeColors.text }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalSubmitBtn, { backgroundColor: themeColors.primary }]}
            onPress={handleCreateClub}
          >
            <Text style={styles.modalSubmitBtnText}>Create Club</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <ConfirmDialog
        visible={!!memberToRemove}
        title="Remove Member"
        message={memberToRemove
          ? `Permanently remove ${memberToRemove.full_name}? This deletes their account and all their data (events they organized, participation, and messages). This cannot be undone.`
          : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (memberToRemove) removeUser(memberToRemove.id);
          setMemberToRemove(null);
        }}
        onClose={() => setMemberToRemove(null)}
      />
    </SafeAreaView>
  );
}

function RequestCard({ app, colors: c, onPress }: { app: VerificationApplication; colors: any; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]} onPress={onPress}>
      <UserAvatar user={{ full_name: app.full_name }} size={48} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: c.text }]}>{app.full_name}</Text>
        <Text style={[styles.meta, { color: c.textMuted }]}>{app.position} • {app.club_name}</Text>
        <View style={[styles.statusPill, { backgroundColor: c.primary + '1A' }]}>
          <Text style={[styles.statusText, { color: c.primary }]}>{app.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}



const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  fab: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  search: { flex: 1, paddingVertical: 12, fontSize: 15 },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterCountBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  segmentedRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    position: 'relative',
  },
  segmentText: { fontSize: 12, fontWeight: '700' },
  badgeDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: 6, right: 6 },
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  activeFilterChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  resetFilterBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  resetFilterText: { fontSize: 12, fontWeight: '700' },
  list: { padding: 16, paddingTop: 6, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 1 },
  addressMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  addressMetaText: { fontSize: 11, fontWeight: '500' },
  metaSmall: { fontSize: 11, marginTop: 2 },
  quickActionRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  quickActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  quickActionText: { fontSize: 10, fontWeight: '700' },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  chatIconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40 },

  // Filter BottomSheet styles
  filterSectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  filterChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterModalChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1 },
  filterModalChipText: { fontSize: 12, fontWeight: '700' },
  filterModalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  filterResetBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  filterResetBtnText: { fontSize: 14, fontWeight: '700' },
  filterApplyBtn: { flex: 1.5, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  filterApplyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalBody: { marginBottom: 8 },
  inputLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalCancelBtnText: { fontSize: 14, fontWeight: '700' },
  modalSubmitBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalSubmitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modalSelector: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  selectorText: { fontSize: 15, fontWeight: '600' },
  selectorPlaceholder: { fontSize: 15 },
  overlayDropdownMenu: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  overlayDropdownMenuUp: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  inlineDropdownMenu: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 6,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  overlayDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  checkmarkWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayDropdownText: {
    fontSize: 15,
  },
});
