import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AreaOfFocus, RotaractEvent, Club } from '../../types';
import { RootStackParamList } from '../../navigation/types';
import { StatusBadge } from '../../components/StatusBadge';
import { EventMap } from '../../components/EventMap';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { zones } from '../../data/mockData';
import { distanceMeters, formatDistance } from '../../utils/checkIn';
import { openNavigationApp } from '../../utils/navigationLauncher';

import { visibleEvents } from '../../utils/eventApproval';
import { BottomSheet } from '../../components/BottomSheet';
import EmergencySosButton from '../../components/EmergencySosButton';

type DistanceOption = '5KM' | '15KM' | '30KM';
type DateOption = 'TODAY' | 'WEEK' | 'MONTH';
type OpennessOption = 'ALL_ROTARACTORS' | 'INTER_CLUB' | 'RECRUITING' | 'CLUB_ONLY';

const DISTANCE_LABEL: Record<DistanceOption, string> = {
  '5KM': 'Within 5 km',
  '15KM': 'Within 15 km',
  '30KM': 'Within 30 km',
};

const DATE_LABEL: Record<DateOption, string> = {
  TODAY: 'Today',
  WEEK: 'This Week',
  MONTH: 'This Month',
};

const OPENNESS_LABEL: Record<OpennessOption, string> = {
  ALL_ROTARACTORS: 'Open to All Rotaractors',
  INTER_CLUB: 'Inter-Club Collaborations',
  RECRUITING: 'Recruiting Volunteers',
  CLUB_ONLY: 'Club Members Only',
};

const AREA_LABEL: Record<AreaOfFocus, string> = {
  PEACEBUILDING: 'Peacebuilding',
  DISEASE_PREVENTION: 'Disease Prevention',
  WATER_SANITATION: 'Water & Sanitation',
  MATERNAL_CHILD_HEALTH: 'Maternal & Child Health',
  EDUCATION_LITERACY: 'Basic Education & Literacy',
  COMMUNITY_DEVELOPMENT: 'Community Development',
  ENVIRONMENT: 'Environment',
};

const ALL_DISTANCES: DistanceOption[] = ['5KM', '15KM', '30KM'];
const ALL_DATES: DateOption[] = ['TODAY', 'WEEK', 'MONTH'];
const ALL_OPENNESS: OpennessOption[] = ['ALL_ROTARACTORS', 'INTER_CLUB', 'RECRUITING', 'CLUB_ONLY'];
const ALL_AREAS: AreaOfFocus[] = [
  'PEACEBUILDING',
  'DISEASE_PREVENTION',
  'WATER_SANITATION',
  'MATERNAL_CHILD_HEALTH',
  'EDUCATION_LITERACY',
  'COMMUNITY_DEVELOPMENT',
  'ENVIRONMENT',
];

function isDateInRange(startIso: string, option: DateOption): boolean {
  const t = new Date(startIso).getTime();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (option === 'TODAY') {
    const endToday = startToday + 86400000;
    return t >= startToday && t < endToday;
  }
  if (option === 'WEEK') {
    const day = now.getDay();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day).getTime();
    const to = from + 7 * 86400000;
    return t >= from && t < to;
  }
  if (option === 'MONTH') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return t >= from && t < to;
  }
  return true;
}

export default function MapScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { events, clubs, users, participants } = useData();
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();

  // Multi-select discovery filters
  const [selectedDistances, setSelectedDistances] = useState<DistanceOption[]>([]);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [selectedOpenness, setSelectedOpenness] = useState<OpennessOption[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<AreaOfFocus[]>([]);
  const [selectedDates, setSelectedDates] = useState<DateOption[]>([]);

  // Search & Modals
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    (async () => {
      const userClub = clubs.find(c => c.id === user?.club_id);
      const defaultFallback =
        userClub?.latitude && userClub?.longitude
          ? { latitude: userClub.latitude, longitude: userClub.longitude }
          : { latitude: 14.6500, longitude: 121.0800 };

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          // 1. Instantly get last known location from OS cache (0ms)
          const lastLoc = await Location.getLastKnownPositionAsync();
          if (lastLoc) {
            setUserCoords({ latitude: lastLoc.coords.latitude, longitude: lastLoc.coords.longitude });
          }
          // 2. Fetch fresh position with balanced accuracy in background without blocking
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        } else {
          setUserCoords(defaultFallback);
        }
      } catch {
        setUserCoords(defaultFallback);
      }
    })();
  }, [user?.club_id, clubs]);

  const activeFilterCount =
    selectedDistances.length + selectedZones.length + selectedOpenness.length + selectedAreas.length + selectedDates.length;

  const toggleDistance = (d: DistanceOption) => {
    setSelectedDistances(prev => (prev.includes(d) ? prev.filter(item => item !== d) : [...prev, d]));
  };

  const toggleZone = (zId: string) => {
    setSelectedZones(prev => (prev.includes(zId) ? prev.filter(item => item !== zId) : [...prev, zId]));
  };

  const toggleOpenness = (op: OpennessOption) => {
    setSelectedOpenness(prev => (prev.includes(op) ? prev.filter(item => item !== op) : [...prev, op]));
  };

  const toggleArea = (area: AreaOfFocus) => {
    setSelectedAreas(prev => (prev.includes(area) ? prev.filter(item => item !== area) : [...prev, area]));
  };

  const toggleDate = (dt: DateOption) => {
    setSelectedDates(prev => (prev.includes(dt) ? prev.filter(item => item !== dt) : [...prev, dt]));
  };

  const clearAllFilters = () => {
    setSelectedDistances([]);
    setSelectedZones([]);
    setSelectedOpenness([]);
    setSelectedAreas([]);
    setSelectedDates([]);
  };

  const filtered = useMemo(() => {
    // The map is a discovery surface, so unpublished events stay off it for everyone —
    // including their own organizers. visibleEvents also keeps drafts out.
    let list = visibleEvents(events, user, users, participants)
      .filter(e => e.status !== 'PENDING_APPROVAL' && e.status !== 'DRAFT' && e.status !== 'CANCELLED');

    // 1. Proximity Filter
    if (userCoords && selectedDistances.length > 0) {
      list = list.filter(e => {
        const d = distanceMeters(userCoords, { latitude: e.latitude, longitude: e.longitude });
        return selectedDistances.some(opt => {
          const maxMeters = opt === '5KM' ? 5000 : opt === '15KM' ? 15000 : 30000;
          return d <= maxMeters;
        });
      });
    }

    // 2. Zone Filter
    if (selectedZones.length > 0) {
      list = list.filter(e => {
        const club = clubs.find((c: Club) => c.id === e.organizing_club_id);
        return club ? selectedZones.includes(club.zone_id) : false;
      });
    }

    // 3. Openness & Access Filter
    if (selectedOpenness.length > 0) {
      list = list.filter(e => {
        return selectedOpenness.some(op => {
          if (op === 'ALL_ROTARACTORS') return e.visibility === 'VERIFIED_ROTARACTORS';
          if (op === 'INTER_CLUB') return e.participating_club_ids && e.participating_club_ids.length > 0;
          if (op === 'RECRUITING') return e.status === 'RECRUITING';
          if (op === 'CLUB_ONLY') return e.visibility === 'CLUB_ONLY';
          return false;
        });
      });
    }

    // 4. Area of Focus Filter
    if (selectedAreas.length > 0) {
      list = list.filter(e => {
        if (!e.areas_of_focus) return false;
        return e.areas_of_focus.some(a => selectedAreas.includes(a));
      });
    }

    // 5. Timeframe Filter
    if (selectedDates.length > 0) {
      list = list.filter(e => selectedDates.some(dt => isDateInRange(e.start_datetime, dt)));
    }

    // 6. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(e => {
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchDesc = e.description.toLowerCase().includes(q);
        const matchClub = e.organizing_club_name.toLowerCase().includes(q);
        const matchAddress = e.address.toLowerCase().includes(q);
        const matchCity = e.city.toLowerCase().includes(q);
        return matchTitle || matchDesc || matchClub || matchAddress || matchCity;
      });
    }

    if (!userCoords) return list;
    return [...list].sort((a, b) => {
      const dA = distanceMeters(userCoords, { latitude: a.latitude, longitude: a.longitude });
      const dB = distanceMeters(userCoords, { latitude: b.latitude, longitude: b.longitude });
      return dA - dB;
    });
  }, [events, users, user, clubs, userCoords, selectedDistances, selectedZones, selectedOpenness, selectedAreas, selectedDates, searchQuery, participants]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: themeColors.text }]}>Explore</Text>
        <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
          Map & spatial discovery across District 3800
        </Text>
      </View>

      {/* Search & Multi-Select Dropdown Trigger */}
      <View style={styles.searchRowContainer}>
        <View style={[styles.searchBox, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Ionicons name="search" size={16} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.text }]}
            placeholder="Search project, club, or location..."
            placeholderTextColor={themeColors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Dropdown Filter Trigger Button */}
        <TouchableOpacity
          style={[
            styles.filterDropdownTrigger,
            {
              backgroundColor: activeFilterCount > 0 ? themeColors.primary + '1F' : themeColors.cardBg,
              borderColor: activeFilterCount > 0 ? themeColors.primary : themeColors.border,
            },
          ]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons name="options-outline" size={18} color={activeFilterCount > 0 ? themeColors.primary : themeColors.text} />
          <Text style={[styles.filterDropdownText, { color: activeFilterCount > 0 ? themeColors.primary : themeColors.text }]}>
            Spatial & Access Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
          </Text>
          <Ionicons name="chevron-down" size={14} color={activeFilterCount > 0 ? themeColors.primary : themeColors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Active Filters Pill Row */}
      {activeFilterCount > 0 && (
        <View style={styles.activePillsRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activePillsScroll}>
            {selectedDistances.map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.activePill, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }]}
                onPress={() => toggleDistance(d)}
              >
                <Text style={styles.activePillText}>{DISTANCE_LABEL[d]}</Text>
                <Ionicons name="close-circle" size={14} color="#fff" />
              </TouchableOpacity>
            ))}
            {selectedZones.map(zId => {
              const zName = zones.find(z => z.id === zId)?.zone_name || zId;
              return (
                <TouchableOpacity
                  key={zId}
                  style={[styles.activePill, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }]}
                  onPress={() => toggleZone(zId)}
                >
                  <Text style={styles.activePillText}>{zName}</Text>
                  <Ionicons name="close-circle" size={14} color="#fff" />
                </TouchableOpacity>
              );
            })}
            {selectedOpenness.map(op => (
              <TouchableOpacity
                key={op}
                style={[styles.activePill, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }]}
                onPress={() => toggleOpenness(op)}
              >
                <Text style={styles.activePillText}>{OPENNESS_LABEL[op]}</Text>
                <Ionicons name="close-circle" size={14} color="#fff" />
              </TouchableOpacity>
            ))}
            {selectedAreas.map(ar => (
              <TouchableOpacity
                key={ar}
                style={[styles.activePill, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }]}
                onPress={() => toggleArea(ar)}
              >
                <Text style={styles.activePillText}>{AREA_LABEL[ar]}</Text>
                <Ionicons name="close-circle" size={14} color="#fff" />
              </TouchableOpacity>
            ))}
            {selectedDates.map(dt => (
              <TouchableOpacity
                key={dt}
                style={[styles.activePill, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }]}
                onPress={() => toggleDate(dt)}
              >
                <Text style={styles.activePillText}>{DATE_LABEL[dt]}</Text>
                <Ionicons name="close-circle" size={14} color="#fff" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.clearLink} onPress={clearAllFilters}>
              <Text style={[styles.clearLinkText, { color: themeColors.danger }]}>Clear All</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* Map Preview */}
      <View style={styles.mapContainer}>
        <EventMap
          events={filtered}
          userCoords={userCoords}
          style={styles.mapCanvas}
          onMarkerPress={id => navigation.navigate('EventDetail', { eventId: id })}
        />

        {/* SOS Panic Button - Upper Left inside the Map */}
        <EmergencySosButton style={styles.mapSosOverlayBtn} />

        <TouchableOpacity
          style={[styles.expandMapBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
          onPress={() => setMapExpanded(true)}
        >
          <Ionicons name="expand-outline" size={16} color={themeColors.text} />
          <Text style={[styles.expandMapText, { color: themeColors.text }]}>Fullscreen Map</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listHeader}>
        <Text style={[styles.listHeaderTitle, { color: themeColors.primary }]}>
          DISCOVER EVENTS NEARBY ({filtered.length})
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            userCoords={userCoords}
            onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
          />
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>
            No events match your current spatial exploration filters.
          </Text>
        }
      />

      {/* Multi-Select Dropdown BottomSheet */}
      <BottomSheet
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        cardStyle={[styles.modalContent, { backgroundColor: themeColors.cardBg }]}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: themeColors.text }]}>Explore & Access Filters</Text>
          <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
            <Ionicons name="close" size={24} color={themeColors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.modalBody}>
          {/* Proximity / Distance Section */}
          <Text style={[styles.modalSectionTitle, { color: themeColors.primary }]}>
            PROXIMITY / DISTANCE (MULTI-SELECT)
          </Text>
          <View style={styles.checkboxGrid}>
            {ALL_DISTANCES.map(d => {
              const selected = selectedDistances.includes(d);
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.checkboxChip,
                    {
                      backgroundColor: selected ? themeColors.primary + '1F' : themeColors.surface,
                      borderColor: selected ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => toggleDistance(d)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={selected ? themeColors.primary : themeColors.textMuted}
                  />
                  <Text style={[styles.checkboxLabel, { color: selected ? themeColors.primary : themeColors.text }]}>
                    {DISTANCE_LABEL[d]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Zone & City Section */}
          <Text style={[styles.modalSectionTitle, { color: themeColors.primary, marginTop: 20 }]}>
            ZONE & DISTRICT SUB-REGIONS (MULTI-SELECT)
          </Text>
          <View style={styles.checkboxGrid}>
            {zones.map(z => {
              const selected = selectedZones.includes(z.id);
              return (
                <TouchableOpacity
                  key={z.id}
                  style={[
                    styles.checkboxChip,
                    {
                      backgroundColor: selected ? themeColors.primary + '1F' : themeColors.surface,
                      borderColor: selected ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => toggleZone(z.id)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={selected ? themeColors.primary : themeColors.textMuted}
                  />
                  <Text style={[styles.checkboxLabel, { color: selected ? themeColors.primary : themeColors.text }]}>
                    {z.zone_name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Openness & Access Section */}
          <Text style={[styles.modalSectionTitle, { color: themeColors.primary, marginTop: 20 }]}>
            OPENNESS & PARTICIPATION ACCESS (MULTI-SELECT)
          </Text>
          <View style={styles.checkboxGrid}>
            {ALL_OPENNESS.map(op => {
              const selected = selectedOpenness.includes(op);
              return (
                <TouchableOpacity
                  key={op}
                  style={[
                    styles.checkboxChip,
                    {
                      backgroundColor: selected ? themeColors.primary + '1F' : themeColors.surface,
                      borderColor: selected ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => toggleOpenness(op)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={selected ? themeColors.primary : themeColors.textMuted}
                  />
                  <Text style={[styles.checkboxLabel, { color: selected ? themeColors.primary : themeColors.text }]}>
                    {OPENNESS_LABEL[op]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Rotary Areas of Focus Section */}
          <Text style={[styles.modalSectionTitle, { color: themeColors.primary, marginTop: 20 }]}>
            ROTARY AREAS OF FOCUS (MULTI-SELECT)
          </Text>
          <View style={styles.checkboxGrid}>
            {ALL_AREAS.map(ar => {
              const selected = selectedAreas.includes(ar);
              return (
                <TouchableOpacity
                  key={ar}
                  style={[
                    styles.checkboxChip,
                    {
                      backgroundColor: selected ? themeColors.primary + '1F' : themeColors.surface,
                      borderColor: selected ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => toggleArea(ar)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={selected ? themeColors.primary : themeColors.textMuted}
                  />
                  <Text style={[styles.checkboxLabel, { color: selected ? themeColors.primary : themeColors.text }]}>
                    {AREA_LABEL[ar]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Timeframe Section */}
          <Text style={[styles.modalSectionTitle, { color: themeColors.primary, marginTop: 20 }]}>
            TIMEFRAME (MULTI-SELECT)
          </Text>
          <View style={styles.checkboxGrid}>
            {ALL_DATES.map(dt => {
              const selected = selectedDates.includes(dt);
              return (
                <TouchableOpacity
                  key={dt}
                  style={[
                    styles.checkboxChip,
                    {
                      backgroundColor: selected ? themeColors.primary + '1F' : themeColors.surface,
                      borderColor: selected ? themeColors.primary : themeColors.border,
                    },
                  ]}
                  onPress={() => toggleDate(dt)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={selected ? themeColors.primary : themeColors.textMuted}
                  />
                  <Text style={[styles.checkboxLabel, { color: selected ? themeColors.primary : themeColors.text }]}>
                    {DATE_LABEL[dt]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.modalFooter, { borderTopColor: themeColors.border }]}>
          <TouchableOpacity
            style={[styles.modalResetBtn, { borderColor: themeColors.border }]}
            onPress={clearAllFilters}
          >
            <Text style={[styles.modalResetText, { color: themeColors.textMuted }]}>Reset All</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modalApplyBtn, { backgroundColor: themeColors.primary }]}
            onPress={() => setFilterModalVisible(false)}
          >
            <Text style={styles.modalApplyText}>Apply Filters ({filtered.length} events)</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <FullscreenMapModal
        visible={mapExpanded}
        events={filtered}
        userCoords={userCoords}
        colors={themeColors}
        onClose={() => setMapExpanded(false)}
        onPinPress={ev => {
          setMapExpanded(false);
          navigation.navigate('EventDetail', { eventId: ev.id });
        }}
      />
    </SafeAreaView>
  );
}

export function EventCard({ event, userCoords, onPress }: { event: RotaractEvent; userCoords?: { latitude: number; longitude: number } | null; onPress: () => void }) {
  const { colors: c } = useTheme();
  let distStr = '';
  if (userCoords) {
    const meters = distanceMeters(userCoords, { latitude: event.latitude, longitude: event.longitude });
    distStr = formatDistance(meters);
  }

  return (
    <TouchableOpacity style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.badgeWrap}>
          <StatusBadge status={event.status} />
          {event.event_type === 'SERVICE_PROJECT' ? (
            <View style={[styles.typeBadge, { backgroundColor: '#EBF9F3' }]}>
              <FontAwesome5 name="hands-helping" size={10} color={c.success} />
              <Text style={[styles.typeText, { color: c.success }]}>Service Project</Text>
            </View>
          ) : (
            <View style={[styles.typeBadge, { backgroundColor: '#FFF4E5' }]}>
              <Ionicons name="people" size={11} color={c.warning} />
              <Text style={[styles.typeText, { color: c.warning }]}>Fellowship</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardDate, { color: c.textMuted }]}>
          {new Date(event.start_datetime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </Text>
      </View>

      <Text style={[styles.cardTitle, { color: c.text }]}>{event.title}</Text>
      <Text style={[styles.cardClub, { color: c.textMuted }]}>{event.organizing_club_name}</Text>

      <View style={styles.cardFooterRow}>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={13} color={c.primary} />
          <Text style={[styles.cardLoc, { color: c.textMuted }]} numberOfLines={1}>
            {event.address}, {event.city}
            {distStr ? ` • ${distStr}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.cardNavBtn, { backgroundColor: c.primary + '18', borderColor: c.primary + '40' }]}
          onPress={(e) => {
            e.stopPropagation?.();
            openNavigationApp(event.latitude, event.longitude, event.title, event.address);
          }}
        >
          <Ionicons name="navigate" size={11} color={c.primary} />
          <Text style={[styles.cardNavBtnText, { color: c.primary }]}>Directions</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function FullscreenMapModal({ visible, events, userCoords, colors: c, onClose, onPinPress }: { visible: boolean; events: RotaractEvent[]; userCoords: { latitude: number; longitude: number } | null; colors: any; onClose: () => void; onPinPress: (ev: RotaractEvent) => void }) {
  const [selectedEv, setSelectedEv] = useState<RotaractEvent | null>(null);

  let selectedDistStr = '';
  if (selectedEv && userCoords) {
    const meters = distanceMeters(userCoords, { latitude: selectedEv.latitude, longitude: selectedEv.longitude });
    selectedDistStr = formatDistance(meters);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.fsSafe, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
          <View style={[styles.fsHeader, { backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
            <Text style={[styles.fsTitle, { color: c.text }]}>District Map ({events.length})</Text>
            <TouchableOpacity style={styles.fsCloseBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color={c.text} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, position: 'relative' }}>
            <EventMap
              events={events}
              userCoords={userCoords}
              style={styles.fsCanvas}
              interactive
              onMarkerPress={id => {
                const ev = events.find(e => e.id === id);
                if (ev) setSelectedEv(ev);
              }}
            />

            {/* SOS Panic Button - Upper Left inside Fullscreen Map */}
            <EmergencySosButton style={styles.mapSosOverlayBtn} />

            {/* Floating Pin Preview HUD */}
            {selectedEv && (
              <View style={[styles.pinHudCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <View style={styles.pinHudHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pinHudTitle, { color: c.text }]} numberOfLines={1}>{selectedEv.title}</Text>
                    <Text style={[styles.pinHudClub, { color: c.textMuted }]}>{selectedEv.organizing_club_name} {selectedDistStr ? `• ${selectedDistStr} away` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedEv(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close-circle" size={20} color={c.textMuted} />
                  </TouchableOpacity>
                </View>

                <View style={styles.pinHudActions}>
                  <TouchableOpacity
                    style={[styles.pinHudNavBtn, { backgroundColor: c.primary + '18', borderColor: c.primary + '40' }]}
                    onPress={() => openNavigationApp(selectedEv.latitude, selectedEv.longitude, selectedEv.title, selectedEv.address)}
                  >
                    <Ionicons name="navigate" size={13} color={c.primary} />
                    <Text style={[styles.pinHudNavBtnText, { color: c.primary }]}>Get Directions</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.pinHudViewBtn, { backgroundColor: c.primary }]}
                    onPress={() => onPinPress(selectedEv)}
                  >
                    <Text style={styles.pinHudViewBtnText}>View Event</Text>
                    <Ionicons name="chevron-forward" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { padding: 20, paddingBottom: 10 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
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
  mapContainer: { height: 180, marginHorizontal: 16, borderRadius: 16, overflow: Platform.OS === 'ios' ? 'hidden' : undefined, marginBottom: 12, position: 'relative' },
  mapCanvas: { width: '100%', height: '100%', borderRadius: 16 },
  mapSosOverlayBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  expandMapBtn: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, zIndex: 10 },
  expandMapText: { fontSize: 11, fontWeight: '700' },
  listHeader: { paddingHorizontal: 20, marginBottom: 8 },
  listHeaderTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: { padding: 14, borderRadius: 14, borderWidth: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  badgeWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 10, fontWeight: '800' },
  cardDate: { fontSize: 11 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardClub: { fontSize: 12, marginTop: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  cardLoc: { fontSize: 12, flex: 1 },
  cardFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  cardNavBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  cardNavBtnText: { fontSize: 10, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 30 },
  fsSafe: { flex: 1 },
  fsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  fsTitle: { fontSize: 17, fontWeight: '800' },
  fsCloseBtn: { padding: 4 },
  fsCanvas: { flex: 1 },
  pinHudCard: { position: 'absolute', bottom: 20, left: 16, right: 16, padding: 14, borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8 },
  pinHudHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  pinHudTitle: { fontSize: 16, fontWeight: '800' },
  pinHudClub: { fontSize: 12, marginTop: 2 },
  pinHudActions: { flexDirection: 'row', gap: 10 },
  pinHudNavBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  pinHudNavBtnText: { fontSize: 12, fontWeight: '700' },
  pinHudViewBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  pinHudViewBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalBody: { paddingBottom: 20 },
  modalSectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 10 },
  checkboxGrid: { gap: 8 },
  checkboxChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  checkboxLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  modalFooter: { flexDirection: 'row', gap: 10, paddingTop: 14, borderTopWidth: 1 },
  modalResetBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalResetText: { fontSize: 13, fontWeight: '700' },
  modalApplyBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalApplyText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
