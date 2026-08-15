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
import { AppUser, VerificationApplication } from '../../types';
import { BottomSheet } from '../../components/BottomSheet';
import UserAvatar from '../../components/UserAvatar';
import RotaryWheel from '../../components/RotaryWheel';
import ClubLogo from '../../components/ClubLogo';
import { VerifiedName } from '../../components/VerifiedCheck';
import { ConfirmDialog } from '../../components/ConfirmDialog';

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
  const { colors: themeColors } = useTheme();

  const isAppAdmin = user?.role === 'APP_ADMIN';
  const [memberToRemove, setMemberToRemove] = useState<AppUser | null>(null);

  const [q, setQ] = useState('');
  const [zoneId, setZoneId] = useState<string | 'ALL'>('ALL');
  const [activeTab, setActiveTab] = useState<SearchTab>('CLUBS');

  // Add Club Modal State
  const [isAddClubModalOpen, setIsAddClubModalOpen] = useState(false);
  const [newClubIdInput, setNewClubIdInput] = useState('');
  const [newClubName, setNewClubName] = useState('');
  const [newClubCity, setNewClubCity] = useState('');
  const [newClubProvince, setNewClubProvince] = useState('');
  const [newClubZoneId, setNewClubZoneId] = useState('z1');
  const [newClubPresident, setNewClubPresident] = useState('');
  const [isProvinceDropdownOpen, setIsProvinceDropdownOpen] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const [isZoneDropdownOpen, setIsZoneDropdownOpen] = useState(false);

  const isDistrictAdmin = user?.role === 'DISTRICT_ADMIN' || user?.role === 'APP_ADMIN';

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
      if (!query) return true;

      const nameMatch = c.club_name.toLowerCase().includes(query);
      const cityMatch = c.city.toLowerCase().includes(query);
      const presidentMatch = c.president_name.toLowerCase().includes(query);
      const memberMatch = users.some(u => u.club_id === c.id && u.full_name.toLowerCase().includes(query));

      return nameMatch || cityMatch || presidentMatch || memberMatch;
    });
  }, [clubs, users, q, zoneId]);

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
      city: newClubCity.trim(),
      province: newClubProvince.trim(),
      zone_id: newClubZoneId,
      president_name: newClubPresident.trim() || 'Pending Election',
    });

    Alert.alert('Club Created', `"${newClubName.trim()}" (ID: ${newClubIdInput.trim()}) has been successfully added to District 3800.`);
    setIsAddClubModalOpen(false);
    setNewClubIdInput('');
    setNewClubName('');
    setNewClubCity('');
    setNewClubProvince('');
    setNewClubPresident('');
    setActiveTab('CLUBS');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      {/* Header with District Admin Add Club button */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Clubs & Members</Text>
          <Text style={[styles.headerSubtitle, { color: themeColors.textMuted }]}>
            District 3800 • {clubs.length} clubs • {users.length} members
          </Text>
        </View>

        {isDistrictAdmin && (
          <TouchableOpacity
            style={[styles.addClubBtn, { backgroundColor: themeColors.primary }]}
            onPress={() => setIsAddClubModalOpen(true)}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addClubBtnText}>Add Club</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Input */}
      <View style={[styles.searchWrap, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
        <Ionicons name="search" size={18} color={themeColors.textMuted} />
        <TextInput
          style={[styles.search, { color: themeColors.text }]}
          placeholder="Search clubs, cities, members, or requests…"
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

      {/* Zone Pill Bar (only show for Clubs and Members) */}
      {activeTab !== 'REQUESTS' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.zoneScroll}
          contentContainerStyle={styles.zoneContent}
        >
          <ZoneChip label="All" active={zoneId === 'ALL'} colors={themeColors} onPress={() => setZoneId('ALL')} />
          {zones.map(z => (
            <ZoneChip key={z.id} label={z.zone_name} active={zoneId === z.id} colors={themeColors} onPress={() => setZoneId(z.id)} />
          ))}
        </ScrollView>
      )}

      {/* Results List */}
      {activeTab === 'CLUBS' ? (
        <FlatList
          data={filteredClubs}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const zone = zones.find(z => z.id === item.zone_id);
            const memberCount = users.filter(u => u.club_id === item.id).length || item.member_count;
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                onPress={() => navigation.navigate('ClubDetail', { clubId: item.id })}
              >
                <ClubLogo size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: themeColors.text }]}>{item.club_name}</Text>
                  <Text style={[styles.meta, { color: themeColors.textMuted }]}>{zone?.zone_name} • {item.city}</Text>
                  <Text style={[styles.metaSmall, { color: themeColors.textMuted }]}>{memberCount} members • President: {item.president_name}</Text>
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

          {/* 3. President Name */}
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>President Name</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
            placeholder="e.g. Juan Dela Cruz"
            placeholderTextColor={themeColors.textMuted}
            value={newClubPresident}
            onChangeText={setNewClubPresident}
          />

          {/* 4. Province / Region Selector */}
          <View style={{ zIndex: isProvinceDropdownOpen ? 1000 : 1, position: 'relative' }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Province / Region *</Text>
            <TouchableOpacity
              style={[styles.modalSelector, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
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
              <View style={[styles.overlayDropdownMenu, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                {PROVINCES.map(p => {
                  const isSelected = newClubProvince === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={styles.overlayDropdownItem}
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
                        {isSelected && <Ionicons name="checkmark-sharp" size={18} color={themeColors.text} />}
                      </View>
                      <Text style={[styles.overlayDropdownText, { color: themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* 5. City / Municipality Selector */}
          <View style={{ zIndex: isCityDropdownOpen ? 900 : 1, position: 'relative' }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>City / Municipality *</Text>
            <TouchableOpacity
              style={[styles.modalSelector, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
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
              <View style={[styles.overlayDropdownMenuUp, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border, maxHeight: 220 }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {(CITIES_BY_PROVINCE[newClubProvince || 'Metro Manila (NCR)'] || []).map(c => {
                    const isSelected = newClubCity === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={styles.overlayDropdownItem}
                        onPress={() => {
                          setNewClubCity(c);
                          setIsCityDropdownOpen(false);
                        }}
                      >
                        <View style={styles.checkmarkWrap}>
                          {isSelected && <Ionicons name="checkmark-sharp" size={18} color={themeColors.text} />}
                        </View>
                        <Text style={[styles.overlayDropdownText, { color: themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{c}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* 6. Zone Dropdown */}
          <View style={{ zIndex: isZoneDropdownOpen ? 800 : 1, position: 'relative' }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Zone *</Text>
            <TouchableOpacity
              style={[styles.modalSelector, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
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
              <View style={[styles.overlayDropdownMenuUp, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                {zones.map(z => {
                  const isSelected = newClubZoneId === z.id;
                  return (
                    <TouchableOpacity
                      key={z.id}
                      style={styles.overlayDropdownItem}
                      onPress={() => {
                        setNewClubZoneId(z.id);
                        setIsZoneDropdownOpen(false);
                      }}
                    >
                      <View style={styles.checkmarkWrap}>
                        {isSelected && <Ionicons name="checkmark-sharp" size={18} color={themeColors.text} />}
                      </View>
                      <Text style={[styles.overlayDropdownText, { color: themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{z.zone_name}</Text>
                    </TouchableOpacity>
                  );
                })}
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

function ZoneChip({ label, active, colors: c, onPress }: { label: string; active: boolean; colors: any; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: active ? c.primary : c.cardBg, borderColor: active ? c.primary : c.border },
      ]}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : c.textMuted }]}>{label}</Text>
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
  addClubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addClubBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  search: { flex: 1, paddingVertical: 12, fontSize: 15 },
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
  zoneScroll: { flexGrow: 0, flexShrink: 0, marginTop: 10, marginBottom: 10 },
  zoneContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  list: { padding: 16, paddingTop: 12, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  avatarLogo: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarLogoText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 1 },
  metaSmall: { fontSize: 11, marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  chatIconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40 },

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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  selectorText: { fontSize: 14, fontWeight: '600' },
  selectorPlaceholder: { fontSize: 14 },
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
  overlayDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
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
