import React, { useState, useRef, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Platform, Keyboard, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { colors } from '../../theme/colors';
import { AreaOfFocus, EventType, EventVisibility, RotaractEvent } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../navigation/types';
import { LocationPicker } from '../../components/LocationPicker';
import { DEFAULT_LOCATION, LocationValue } from '../../components/location/shared';
import ClubAllocationFields, { ClubAllocationValue, allocationFieldsToEvent } from '../../components/ClubAllocationFields';
import CohostingFields, { CohostingValue, cohostingFieldsToEvent } from '../../components/CohostingFields';
import { AreasOfFocusPicker } from '../../components/AreasOfFocusPicker';
import { CoverPhotoPicker } from '../../components/CoverPhotoPicker';
import { CalendarGridModal } from '../../components/CalendarGridModal';
import { SegmentedTimeInput } from '../../components/SegmentedTimeInput';
import { ConfirmRulesModal } from '../../components/ConfirmRulesModal';
import { editLockRulesForSubmit } from '../../utils/eventEditPolicy';
import { KeyboardAwareScrollView, useKeyboardAwareOnFocus } from '../../components/KeyboardAwareScrollView';
import AppSwitch from '../../components/AppSwitch';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateEvent'>;

const defaultStart = new Date();
defaultStart.setDate(defaultStart.getDate() + 1);
defaultStart.setHours(9, 0, 0, 0);

const defaultEnd = new Date(defaultStart);
defaultEnd.setHours(13, 0, 0, 0);

export default function CreateEventScreen({ route, navigation }: Props) {
  const template = route.params?.templateEvent;
  const { user } = useAuth();
  const { createEvent, users, clubs } = useData();
  const { colors: themeColors, isNightMode } = useTheme();
  const onFocusAware = useKeyboardAwareOnFocus();

  const [title, setTitle] = useState(template ? `${template.title} (Copy)` : '');
  const [desc, setDesc] = useState(template?.description ?? '');
  const [type, setType] = useState<EventType>(template?.event_type ?? 'SERVICE_PROJECT');
  const [selectedCoOrganizers, setSelectedCoOrganizers] = useState<string[]>([]);
  const [coOrgQuery, setCoOrgQuery] = useState('');
  const [isCoOrgFocused, setIsCoOrgFocused] = useState(false);
  const coOrgInputRef = useRef<TextInput>(null);


  const [location, setLocation] = useState<LocationValue>(
    template
      ? {
          address: template.address,
          city: template.city,
          latitude: template.latitude,
          longitude: template.longitude,
        }
      : DEFAULT_LOCATION,
  );
  const [areasOfFocus, setAreasOfFocus] = useState<AreaOfFocus[]>(template?.areas_of_focus ?? []);
  const [coverPhoto, setCoverPhoto] = useState<string | undefined>(template?.cover_photo);
  const [maxP, setMaxP] = useState(template ? String(template.max_participants) : '50');
  const [visibility, setVisibility] = useState<EventVisibility>(template?.visibility ?? 'VERIFIED_ROTARACTORS');
  const [requiresApproval, setRequiresApproval] = useState(template?.requires_approval ?? false);
  const [allocation, setAllocation] = useState<ClubAllocationValue>({
    mode: template?.allocation_mode ?? 'NONE',
    defaultSlots: template?.default_club_allocation != null ? String(template.default_club_allocation) : '5',
    releaseHoursBefore: 24,
  });
  const [cohosting, setCohosting] = useState<CohostingValue>({
    enabled: template?.cohosting_enabled ?? false,
    feePesos: template?.cohosting_fee_centavos != null ? String(Math.round(template.cohosting_fee_centavos / 100)) : '500',
    maxClubs: template?.cohosting_max_clubs != null ? String(template.cohosting_max_clubs) : '',
    requiresApproval: template?.cohosting_requires_approval ?? true,
    benefits: template?.cohosting_benefits ?? '',
    deadlineHoursBefore: 48,
  });
  const [allowInvites, setAllowInvites] = useState(template?.allow_participant_invites ?? true);
  const [geofenceRadius, setGeofenceRadius] = useState<number>(template?.geofence_radius_meters ?? 300);
  const [contactNumber, setContactNumber] = useState(user?.contact_number ?? '0917 123 4567');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [lockCutoffHours, setLockCutoffHours] = useState<number>(24);

  // Single Date & Initial --:-- -- Times state
  const [eventDate, setEventDate] = useState<Date>(defaultStart);
  const [startTime, setStartTime] = useState<Date | null>(() => {
    if (template) {
      const orig = new Date(template.start_datetime);
      const d = new Date(defaultStart);
      d.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      return d;
    }
    return null;
  });
  const [endTime, setEndTime] = useState<Date | null>(() => {
    if (template) {
      const orig = new Date(template.end_datetime);
      const d = new Date(defaultStart);
      d.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      return d;
    }
    return null;
  });
  const [startTimeError, setStartTimeError] = useState<string | null>(null);
  const [endTimeError, setEndTimeError] = useState<string | null>(null);

  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [activePickerTarget, setActivePickerTarget] = useState<'startTime' | 'endTime' | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const isServiceProject = type === 'SERVICE_PROJECT';

  // Mirrors the status decision in performCreate, so the prompt matches what happens.
  const willNeedApproval = (() => {
    if (!user) return true;
    if (type === 'DISTRICT_EVENT') return !(user.role === 'DISTRICT_ADMIN' || user.role === 'APP_ADMIN');
    const coOrgClubIds = selectedCoOrganizers
      .map(id => users.find(u => u.id === id)?.club_id)
      .filter((id): id is string => Boolean(id));
    const involvedClubIds = new Set([
      user.club_id,
      ...coOrgClubIds,
    ]);
    return !(user.role === 'CLUB_PRESIDENT' && involvedClubIds.size === 1);
  })();

  const constructFullDateTime = (dateObj: Date, timeObj: Date | null) => {
    if (!timeObj) return null;
    const combined = new Date(dateObj);
    combined.setHours(timeObj.getHours(), timeObj.getMinutes(), 0, 0);
    return combined;
  };

  const startDateTime = constructFullDateTime(eventDate, startTime);
  const endDateTime = constructFullDateTime(eventDate, endTime);

  const handlePickerChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      const target = activePickerTarget;
      setActivePickerTarget(null);
      if (event.type === 'set' && selectedDate && target) {
        if (target === 'startTime') {
          setStartTime(selectedDate);
          setStartTimeError(null);
          if (endTime && selectedDate >= endTime) {
            const nextEnd = new Date(selectedDate.getTime() + 4 * 3600000);
            setEndTime(nextEnd);
            setEndTimeError(null);
          }
        } else if (target === 'endTime') {
          setEndTime(selectedDate);
          if (startTime && selectedDate <= startTime) {
            setEndTimeError('End time must be after start time');
          } else {
            setEndTimeError(null);
          }
        }
      }
    } else if (selectedDate && activePickerTarget) {
      if (activePickerTarget === 'startTime') {
        setStartTime(selectedDate);
        setStartTimeError(null);
        if (endTime && selectedDate >= endTime) {
          const nextEnd = new Date(selectedDate.getTime() + 4 * 3600000);
          setEndTime(nextEnd);
          setEndTimeError(null);
        }
      } else if (activePickerTarget === 'endTime') {
        setEndTime(selectedDate);
        if (startTime && selectedDate <= startTime) {
          setEndTimeError('End time must be after start time');
        } else {
          setEndTimeError(null);
        }
      }
    }
  };

  const handleContactNumberChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 11);
    if (digitsOnly.length > 7) {
      setContactNumber(`${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4, 7)} ${digitsOnly.slice(7)}`);
    } else if (digitsOnly.length > 4) {
      setContactNumber(`${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4)}`);
    } else {
      setContactNumber(digitsOnly);
    }
  };

  const submit = () => {
    if (!title || !desc || !location.address) {
      Alert.alert('Missing fields', 'Please fill in title, description and location.');
      return;
    }
    const contactDigits = contactNumber.replace(/[^0-9]/g, '');
    if (!contactDigits) {
      Alert.alert('Missing Contact Number', 'Please enter an 11-digit contact number (e.g. 0917 123 4567).');
      return;
    }
    if (contactDigits.length !== 11) {
      Alert.alert('Invalid Contact Number', 'Contact number must be exactly 11 digits (e.g. 0917 123 4567).');
      return;
    }
    if (isServiceProject && areasOfFocus.length === 0) {
      Alert.alert('Select an area of focus', 'Service projects need at least one area of focus.');
      return;
    }
    if (!startTime || !endTime) {
      Alert.alert('Missing Time', 'Please set Start time and End time for the event.');
      return;
    }
    if (!startDateTime || !endDateTime || endDateTime <= startDateTime || startTimeError || endTimeError) {
      Alert.alert('Invalid Schedule', endTimeError || 'Event end time must be after start time.');
      return;
    }
    if (!user) return;

    // Everything validated — get explicit sign-off on the lock rules before creating.
    setConfirmVisible(true);
  };

  const performCreate = () => {
    setConfirmVisible(false);
    if (!user || !startDateTime || !endDateTime) return;

    const isDistrictAdmin = user.role === 'DISTRICT_ADMIN' || user.role === 'APP_ADMIN';
    const isPresident = user.role === 'CLUB_PRESIDENT';
    const isDistrictEvent = type === 'DISTRICT_EVENT';

    const coOrgClubIds = selectedCoOrganizers
      .map(id => users.find(u => u.id === id)?.club_id)
      .filter((id): id is string => Boolean(id));
    // participating_club_ids still means "every club involved" — it drives club
    // event lists, analytics and the inter-club map filter. With the co-host picker
    // gone it is simply the organizing club plus the co-organizers' clubs.
    const involvedClubIds = Array.from(new Set([
      user.club_id,
      ...coOrgClubIds,
    ]));

    const isSingleClubEvent = involvedClubIds.length === 1;

    let initialStatus: RotaractEvent['status'] = 'PENDING_APPROVAL';
    let approvedByClubIds: string[] = [];

    if (isDistrictEvent) {
      initialStatus = (user.role === 'DISTRICT_ADMIN' || user.role === 'APP_ADMIN') ? 'RECRUITING' : 'PENDING_APPROVAL';
    } else if (user.role === 'CLUB_PRESIDENT' && isSingleClubEvent) {
      initialStatus = 'RECRUITING';
      approvedByClubIds = [user.club_id];
    } else if (user.role === 'CLUB_PRESIDENT') {
      initialStatus = 'PENDING_APPROVAL';
      approvedByClubIds = [user.club_id];
    }

    const created = createEvent({
      title,
      description: desc,
      event_type: type,
      status: initialStatus,
      start_datetime: startDateTime.toISOString(),
      end_datetime: endDateTime.toISOString(),
      latitude: location.latitude,
      longitude: location.longitude,
      address: location.address,
      city: location.city,
      organizing_club_id: user.club_id,
      organizing_club_name: user.club_name,
      organizer_user_id: user.id,
      co_organizer_user_ids: selectedCoOrganizers,
      participating_club_ids: involvedClubIds,
      max_participants: parseInt(maxP, 10) || 50,
      // District events: open to all verified members, no join approval, and the
      // whole district is invited on publish — so these are forced, not user-set.
      requires_approval: isDistrictEvent ? false : requiresApproval,
      allow_participant_invites: isDistrictEvent ? false : allowInvites,
      visibility: isDistrictEvent ? 'VERIFIED_ROTARACTORS' : visibility,
      cover_photo: coverPhoto,
      contact_number: contactNumber.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      areas_of_focus: isServiceProject ? areasOfFocus : undefined,
      lock_leave_cutoff_hours: lockCutoffHours,
      ...allocationFieldsToEvent(allocation, startDateTime.toISOString()),
      ...cohostingFieldsToEvent(cohosting, startDateTime.toISOString()),
      approved_by_club_ids: approvedByClubIds,
      geofence_radius_meters: geofenceRadius,
    });

    if (initialStatus === 'RECRUITING') {
      Alert.alert('Event Published!', 'Your event is now active in recruiting mode.', [
        {
          text: 'View Event',
          onPress: () => navigation.replace('EventDetail', { eventId: created.id }),
        },
      ]);
    } else if (isDistrictEvent) {
      Alert.alert(
        'Submitted for District Approval!',
        'Your District Event draft was sent to the District Administrator for review before publishing.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } else {
      const awaiting = involvedClubIds.filter(id => !approvedByClubIds.includes(id)).length;
      Alert.alert(
        'Submitted for Approval!',
        isSingleClubEvent
          ? 'Your event draft was sent to your Club President for approval before publishing.'
          : `This event involves ${involvedClubIds.length} clubs, so all ${involvedClubIds.length} club Presidents must approve it. ${awaiting} ${awaiting === 1 ? 'approval is' : 'approvals are'} pending. Until then it is only visible to your organizing team and those Presidents.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom', 'left', 'right']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardTopMargin={32}
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          setIsCoOrgFocused(false);
          setCoOrgQuery('');
        }}
      >
        <Pressable
          style={{ flex: 1, gap: 16 }}
          onPress={() => {
            Keyboard.dismiss();
            setIsCoOrgFocused(false);
            setCoOrgQuery('');
          }}
        >
          {/* SECTION 1: Event Details & Media */}
          <SectionCard
            icon="document-text-outline"
            title="Event Details"
            subtitle="Basic information, type, and organizing team"
          >
            <CoverPhotoPicker value={coverPhoto} onChange={setCoverPhoto} />

            <Text style={[styles.label, { color: themeColors.text }]}>Event Type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[
                  styles.typeCard,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                  type === 'SERVICE_PROJECT' && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                ]}
                onPress={() => setType('SERVICE_PROJECT')}
              >
                <FontAwesome5 name="hands-helping" size={16} color={type === 'SERVICE_PROJECT' ? '#fff' : themeColors.primary} />
                <Text style={[styles.typeText, { color: themeColors.text }, type === 'SERVICE_PROJECT' && styles.typeTextActive]}>
                  Service Project
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeCard,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                  type === 'FELLOWSHIP' && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                ]}
                onPress={() => setType('FELLOWSHIP')}
              >
                <Ionicons name="people" size={18} color={type === 'FELLOWSHIP' ? '#fff' : themeColors.primary} />
                <Text style={[styles.typeText, { color: themeColors.text }, type === 'FELLOWSHIP' && styles.typeTextActive]}>
                  Fellowship
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeCard,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                  type === 'DISTRICT_EVENT' && { backgroundColor: '#C9A227', borderColor: '#C9A227' },
                ]}
                onPress={() => setType('DISTRICT_EVENT')}
              >
                <Ionicons name="ribbon" size={18} color={type === 'DISTRICT_EVENT' ? '#fff' : '#C9A227'} />
                <Text style={[styles.typeText, { color: themeColors.text }, type === 'DISTRICT_EVENT' && styles.typeTextActive]}>
                  District Event
                </Text>
              </TouchableOpacity>
            </View>

            <Field
              label="Event Name"
              value={title}
              onChangeText={setTitle}
              placeholder={isServiceProject ? 'Community Coastal Cleanup' : type === 'DISTRICT_EVENT' ? 'District 3800 Assembly' : 'Rotaract Fellowship Night'}
            />
            <Field
              label="Description"
              value={desc}
              onChangeText={setDesc}
              placeholder={isServiceProject ? "What's this project about?" : type === 'DISTRICT_EVENT' ? 'Describe this district-wide event — agenda, who should attend, and what to expect...' : 'Describe your fellowship gathering...'}
              multiline
              numberOfLines={4}
            />
            {isServiceProject && <AreasOfFocusPicker selected={areasOfFocus} onChange={setAreasOfFocus} />}

            {/* Involved Co-Organizers & Team Members Picker */}
            <Text style={[styles.label, { color: themeColors.text }]}>Involved Co-Organizers & Team Members</Text>
            <TouchableOpacity
              activeOpacity={1}
              style={[
                styles.pillBoxContainer,
                { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                isCoOrgFocused && { borderColor: themeColors.primary, borderWidth: 1.5 },
              ]}
              onPress={() => coOrgInputRef.current?.focus()}
            >
              {selectedCoOrganizers.map(id => {
                const u = users.find(usr => usr.id === id);
                if (!u) return null;
                const shortClub = u.club_name ? u.club_name.replace('Rotaract Club of ', '') : '';
                const pillLabel = shortClub ? `${u.full_name} (${shortClub})` : u.full_name;
                return (
                  <View key={u.id} style={[styles.tagPill, { backgroundColor: themeColors.primary + '14' }]}>
                    <Text style={[styles.tagPillText, { color: themeColors.primary }]}>{pillLabel}</Text>
                    <TouchableOpacity
                      onPress={() => setSelectedCoOrganizers(prev => prev.filter(selectedId => selectedId !== id))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={13} color={themeColors.primary} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              <TextInput
                ref={coOrgInputRef}
                style={[styles.inlineTagInput, { color: themeColors.text }]}
                placeholder={selectedCoOrganizers.length === 0 ? "Type member's name..." : (isCoOrgFocused ? "Add another..." : "")}
                placeholderTextColor={themeColors.textMuted}
                value={coOrgQuery}
                onChangeText={setCoOrgQuery}
                onFocus={(e: any) => {
                  setIsCoOrgFocused(true);
                  onFocusAware();
                  if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
                    setTimeout(() => {
                      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                  }
                }}
                onBlur={() => setIsCoOrgFocused(false)}
              />
            </TouchableOpacity>

            {/* Member Search Suggestions Dropdown */}
            {coOrgQuery.trim().length > 0 && (
              <View style={{ position: 'relative', zIndex: 100 }}>
                <TouchableOpacity
                  style={styles.coOrgBackdrop}
                  activeOpacity={1}
                  onPress={() => {
                    setCoOrgQuery('');
                    Keyboard.dismiss();
                    setIsCoOrgFocused(false);
                  }}
                />
                <View style={[styles.coOrgDropdown, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border, zIndex: 2 }]}>
                  {users
                    .filter(u => {
                      if (u.id === user?.id) return false;
                      if (selectedCoOrganizers.includes(u.id)) return false;
                      const q = coOrgQuery.toLowerCase();
                      return u.full_name.toLowerCase().includes(q) || u.club_name.toLowerCase().includes(q);
                    })
                    .slice(0, 5)
                    .map(u => {
                      const shortClub = u.club_name.replace('Rotaract Club of ', '');
                      return (
                        <TouchableOpacity
                          key={u.id}
                          style={[styles.coOrgDropdownItem, { borderBottomColor: themeColors.border }]}
                          onPress={() => {
                            setSelectedCoOrganizers(prev => [...prev, u.id]);
                            setCoOrgQuery('');
                            Keyboard.dismiss();
                            setIsCoOrgFocused(false);
                          }}
                        >
                          <View style={[styles.coOrgItemAvatar, { backgroundColor: themeColors.primary }]}>
                            <Text style={styles.coOrgItemAvatarText}>{u.full_name[0]}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.coOrgItemName, { color: themeColors.text }]}>{u.full_name}</Text>
                            <Text style={[styles.coOrgItemSub, { color: themeColors.textMuted }]}>{u.position || 'Member'} • {shortClub}</Text>
                          </View>
                          <Ionicons name="add-circle" size={18} color={themeColors.primary} />
                        </TouchableOpacity>
                      );
                    })}
                  {users.filter(u => u.id !== user?.id && !selectedCoOrganizers.includes(u.id) && (u.full_name.toLowerCase().includes(coOrgQuery.toLowerCase()) || u.club_name.toLowerCase().includes(coOrgQuery.toLowerCase()))).length === 0 && (
                    <Text style={[styles.noMatchText, { color: themeColors.textMuted }]}>No members found matching "{coOrgQuery}"</Text>
                  )}
                </View>
              </View>
            )}
          </SectionCard>

          {/* SECTION 2: Schedule & Venue */}
          <SectionCard
            icon="calendar-outline"
            title="Schedule & Venue"
            subtitle="Event date, time window, location, and geofence"
          >
            {/* Date Selector Input Box */}
            <Text style={[styles.label, { color: themeColors.text }]}>Event Date</Text>
            <TouchableOpacity
              style={[
                styles.inputBoxWithIcon,
                { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                calendarModalVisible && { borderColor: themeColors.primary, borderWidth: 1.5 },
              ]}
              onPress={() => setCalendarModalVisible(true)}
            >
              <Text style={[styles.inputBoxText, { color: themeColors.text }]}>
                {eventDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={calendarModalVisible ? themeColors.primary : themeColors.text} />
            </TouchableOpacity>

            {/* Side-by-Side 3-Segment Time Inputs */}
            <View style={styles.timeGridRow}>
              <SegmentedTimeInput
                label="Start time"
                value={startTime}
                baseDate={eventDate}
                onChangeTime={newTime => {
                  setStartTime(newTime);
                  setStartTimeError(null);
                  if (endTime && endTime <= newTime) {
                    setEndTimeError('End time must be after start time');
                  } else {
                    setEndTimeError(null);
                  }
                }}
                onOpenPicker={() => setActivePickerTarget('startTime')}
                error={startTimeError}
              />

              <SegmentedTimeInput
                label="End time"
                value={endTime}
                baseDate={eventDate}
                onChangeTime={newTime => {
                  setEndTime(newTime);
                  if (startTime && newTime <= startTime) {
                    setEndTimeError('End time must be after start time');
                  } else {
                    setEndTimeError(null);
                  }
                }}
                onOpenPicker={() => setActivePickerTarget('endTime')}
                error={endTimeError}
              />
            </View>

            <LocationPicker value={location} onChange={setLocation} geofenceRadius={geofenceRadius} />

            {/* Check-In Geofence Perimeter Radius */}
            <Text style={[styles.label, { color: themeColors.text }]}>Check-In Geofence Perimeter</Text>
            <Text style={[styles.subHint, { color: themeColors.textMuted }]}>
              Participants within this {geofenceRadius}m radius can verify attendance with 1-tap GPS check-in.
            </Text>
            <View style={styles.radiusPillsRow}>
              {[100, 300, 500].map(val => {
                const labels: Record<number, string> = { 100: '100m (Indoor)', 300: '300m (Standard)', 500: '500m (Outdoor)' };
                const isSelected = geofenceRadius === val;
                return (
                  <TouchableOpacity
                    key={val}
                    activeOpacity={0.7}
                    style={[
                      styles.radiusPill,
                      { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                      isSelected && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                    ]}
                    onPress={() => setGeofenceRadius(val)}
                  >
                    <Ionicons
                      name={isSelected ? 'shield-checkmark' : 'ellipse-outline'}
                      size={13}
                      color={isSelected ? '#fff' : themeColors.textMuted}
                    />
                    <Text style={[styles.radiusPillText, { color: themeColors.text }, isSelected && styles.radiusPillTextActive]}>
                      {labels[val]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SectionCard>

          {/* SECTION 3: Access & Capacity */}
          <SectionCard
            icon="shield-checkmark-outline"
            title="Access & Capacity"
            subtitle="Attendee limits, visibility, and sign-up rules"
          >
            <Field label="Max Participants" value={maxP} onChangeText={setMaxP} keyboardType="number-pad" placeholder="50" />

            {type === 'DISTRICT_EVENT' ? (
              <View style={[styles.districtInfoRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Ionicons name="globe-outline" size={16} color={themeColors.primary} />
                <Text style={[styles.districtInfoText, { color: themeColors.textMuted }]}>
                  Open to all verified members. Publishing invites everyone across the district.
                </Text>
              </View>
            ) : (
              <>
                <Text style={[styles.label, { color: themeColors.text }]}>Event Visibility</Text>
                <View style={styles.visRow}>
                  {([
                    { key: 'VERIFIED_ROTARACTORS', label: 'Verified', icon: 'shield-checkmark-outline' as const },
                    { key: 'CLUB_ONLY', label: 'Club Only', icon: 'home-outline' as const },
                    { key: 'INVITATION_ONLY', label: 'Invite Only', icon: 'mail-outline' as const },
                  ] as { key: EventVisibility; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(v => {
                    const active = visibility === v.key;
                    return (
                      <TouchableOpacity
                        key={v.key}
                        onPress={() => setVisibility(v.key)}
                        style={[
                          styles.visChip,
                          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                          active && [styles.visChipActive, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }],
                        ]}
                      >
                        <Ionicons name={v.icon} size={14} color={active ? '#fff' : themeColors.textMuted} />
                        <Text style={[styles.visChipText, { color: themeColors.text }, active && styles.visChipTextActive]}>
                          {v.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[styles.label, { color: themeColors.text }]}>Lock Leave Cutoff</Text>
            <Text style={[styles.subHint, { color: themeColors.textMuted }]}>
              Prevent attendees from leaving the event within {lockCutoffHours}h before start time to avoid last-minute drops.
            </Text>
            <View style={styles.visRow}>
              {[6, 12, 24].map(hrs => {
                const active = lockCutoffHours === hrs;
                return (
                  <TouchableOpacity
                    key={hrs}
                    onPress={() => setLockCutoffHours(hrs)}
                    style={[
                      styles.visChip,
                      { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                      active && [styles.visChipActive, { backgroundColor: themeColors.primary, borderColor: themeColors.primary }],
                    ]}
                  >
                    <Ionicons name="time-outline" size={14} color={active ? '#fff' : themeColors.textMuted} />
                    <Text style={[styles.visChipText, { color: themeColors.text }, active && styles.visChipTextActive]}>
                      {hrs} Hours Before
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {type !== 'DISTRICT_EVENT' && (
              <View style={styles.togglesGroup}>
                <SettingToggleRow
                  icon="person-add-outline"
                  label="Require Organizer Approval"
                  subtitle="Review and approve participant requests before confirming them"
                  value={requiresApproval}
                  onChange={setRequiresApproval}
                />
                <SettingToggleRow
                  icon="share-social-outline"
                  label="Allow Participant Invites"
                  subtitle="Permit confirmed attendees to invite their fellow Rotaractors"
                  value={allowInvites}
                  onChange={setAllowInvites}
                />
              </View>
            )}
          </SectionCard>

          {/* SECTION 4: Multi-Club Collaboration & Cohosting */}
          <SectionCard
            icon="business-outline"
            title="Multi-Club & Cohosting"
            subtitle="Configure club slot allocations and co-hosting arrangements"
          >
            <ClubAllocationFields value={allocation} onChange={setAllocation} />
            <View style={[styles.cardDivider, { backgroundColor: themeColors.border }]} />
            <CohostingFields value={cohosting} onChange={setCohosting} />
          </SectionCard>

          {/* SECTION 5: Organizer Contact Details */}
          <SectionCard
            icon="call-outline"
            title="Organizer Contact"
            subtitle="Contact details displayed to attendees for questions"
          >
            <Field
              label="Contact Number"
              value={contactNumber}
              onChangeText={handleContactNumberChange}
              keyboardType="phone-pad"
              placeholder="0917 123 4567"
              maxLength={13}
            />
            <Field
              label="Contact Email"
              value={contactEmail}
              onChangeText={setContactEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="event@rotaract.org"
            />
          </SectionCard>

          {/* Action Buttons Footer */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.cancelBtn, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelBtnText, { color: themeColors.text }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: themeColors.primary }]}
              onPress={submit}
              activeOpacity={0.8}
            >
              <Ionicons name={willNeedApproval ? 'send' : 'add-circle'} size={18} color="#fff" />
              <Text style={styles.submitText}>{willNeedApproval ? 'Submit for Approval' : 'Publish Event'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </KeyboardAwareScrollView>

      <ConfirmRulesModal
        visible={confirmVisible}
        title={willNeedApproval ? 'Submit for Approval?' : 'Publish This Event?'}
        intro={
          willNeedApproval
            ? 'Once submitted, what you can change is limited. Please review the rules below before sending it for approval.'
            : 'Once published, what you can change is limited. Please review the rules below before publishing.'
        }
        rules={editLockRulesForSubmit(lockCutoffHours, willNeedApproval)}
        confirmLabel={willNeedApproval ? 'Submit for Approval' : 'Publish Event'}
        confirmIcon={willNeedApproval ? 'send' : 'megaphone'}
        onConfirm={performCreate}
        onCancel={() => setConfirmVisible(false)}
      />

      {/* Calendar Grid Modal */}
      <CalendarGridModal
        visible={calendarModalVisible}
        selectedDate={eventDate}
        onSelectDate={d => setEventDate(d)}
        onClose={() => setCalendarModalVisible(false)}
      />

      {/* Time Picker Modal triggered by Clock Icon */}
      {activePickerTarget && (
        <View style={[styles.pickerContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerHeaderTitle, { color: themeColors.text }]}>
              Select {activePickerTarget === 'startTime' ? 'Start Time' : 'End Time'}
            </Text>
            <TouchableOpacity style={[styles.pickerDoneBtn, { backgroundColor: themeColors.primary }]} onPress={() => setActivePickerTarget(null)}>
              <Text style={styles.pickerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={
              activePickerTarget === 'startTime'
                ? startTime || defaultStart
                : endTime || defaultEnd
            }
            mode="time"
            is24Hour={false}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handlePickerChange}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={[styles.sectionCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconCircle, { backgroundColor: themeColors.primary + '18' }]}>
          <Ionicons name={icon} size={18} color={themeColors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: themeColors.textMuted }]}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SettingToggleRow({
  icon,
  label,
  subtitle,
  value,
  onChange,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.settingRow, { borderBottomColor: themeColors.border }]}
      onPress={() => onChange(!value)}
      activeOpacity={0.7}
    >
      {icon && (
        <View style={[styles.settingIconWrap, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          <Ionicons name={icon} size={16} color={value ? themeColors.primary : themeColors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={[styles.settingLabel, { color: themeColors.text }]}>{label}</Text>
        {subtitle ? <Text style={[styles.settingSubtitle, { color: themeColors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      <AppSwitch
        value={value}
        onValueChange={onChange}
      />
    </TouchableOpacity>
  );
}

function Field({ label, ...rest }: any) {
  const { colors: themeColors } = useTheme();
  const [focused, setFocused] = useState(false);
  const onFocusAware = useKeyboardAwareOnFocus();
  return (
    <View style={styles.fieldWrapper}>
      <Text style={[styles.label, { color: themeColors.text }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
          focused && [styles.inputFocused, { borderColor: themeColors.primary }],
          rest.multiline && { minHeight: 90, textAlignVertical: 'top' },
        ]}
        onFocus={(e: any) => {
          setFocused(true);
          onFocusAware();
          if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
            setTimeout(() => {
              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        placeholderTextColor={themeColors.textMuted}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },

  // Material Design 3 Section Cards
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  sectionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 1,
    lineHeight: 16,
  },
  sectionBody: {
    gap: 12,
  },
  fieldWrapper: {
    marginTop: 2,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },

  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  inputFocused: { borderWidth: 1.5 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeCard: { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, gap: 6 },
  typeCardActive: { },
  typeText: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  typeTextActive: { color: '#fff' },
  districtInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, marginVertical: 4 },
  districtInfoText: { fontSize: 12, flex: 1, lineHeight: 16 },
  subLabelHint: { fontSize: 11, marginBottom: 8 },
  pillBoxContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    minHeight: 48,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tagPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inlineTagInput: {
    flex: 1,
    minWidth: 110,
    fontSize: 13,
    padding: 0,
    height: 26,
  },
  coOrgBackdrop: {
    position: 'absolute',
    top: -2000,
    bottom: -2000,
    left: -2000,
    right: -2000,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  coOrgDropdown: { borderRadius: 12, borderWidth: 1, overflow: 'hidden', marginTop: 4, marginBottom: 8 },
  coOrgDropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  coOrgItemAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  coOrgItemAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coOrgItemName: { fontSize: 13, fontWeight: '700' },
  coOrgItemSub: { fontSize: 11, marginTop: 1 },
  noMatchText: { fontSize: 12, fontStyle: 'italic', padding: 12, textAlign: 'center' },

  visRow: { flexDirection: 'row', gap: 8 },
  visChip: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  visChipActive: { },
  visChipText: { fontSize: 11, fontWeight: '700' },
  visChipTextActive: { color: '#fff' },

  // Setting Switches
  togglesGroup: {
    marginTop: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  settingLabel: { fontSize: 13, fontWeight: '700' },
  settingSubtitle: { fontSize: 11, marginTop: 2, lineHeight: 15 },

  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  submitBtn: {
    flex: 1.6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 14,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Date & Time input box styles
  inputBoxWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  inputBoxText: {
    fontSize: 14,
    fontWeight: '500',
  },
  timeGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  subHint: { fontSize: 11, marginBottom: 8, marginTop: -2, lineHeight: 15 },
  pickerContainer: { borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 12, overflow: 'hidden' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  pickerHeaderTitle: { fontSize: 13, fontWeight: '700' },
  pickerDoneBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  pickerDoneText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Geofence radius pills
  radiusPillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
    marginBottom: 4,
  },
  radiusPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  radiusPillActive: {
  },
  radiusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  radiusPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
