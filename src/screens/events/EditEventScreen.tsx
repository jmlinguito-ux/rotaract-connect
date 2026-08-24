import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Platform, Keyboard, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { AreaOfFocus, EventType, EventVisibility } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ClubAllocationFields, { ClubAllocationValue, allocationFieldsToEvent } from '../../components/ClubAllocationFields';
import CohostingFields, { CohostingValue, cohostingFieldsToEvent } from '../../components/CohostingFields';
import { RootStackParamList } from '../../navigation/types';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SegmentedTimeInput } from '../../components/SegmentedTimeInput';
import { CalendarGridModal } from '../../components/CalendarGridModal';
import { LocationPicker } from '../../components/LocationPicker';
import { LocationValue } from '../../components/location/shared';
import { AreasOfFocusPicker } from '../../components/AreasOfFocusPicker';
import { CoverPhotoPicker } from '../../components/CoverPhotoPicker';
import { eventEditPolicy, isMaterialChange } from '../../utils/eventEditPolicy';
import { ConfirmRulesModal } from '../../components/ConfirmRulesModal';
import { KeyboardAwareScrollView, useKeyboardAwareOnFocus } from '../../components/KeyboardAwareScrollView';
import type { RotaractEvent } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditEvent'>;

export default function EditEventScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  const onFocusAware = useKeyboardAwareOnFocus();
  const { events, updateEvent, users, clubs, participantsFor, resetEventApprovals } = useData();

  const event = events.find(e => e.id === eventId);

  const [title, setTitle] = useState(event?.title ?? '');
  const [desc, setDesc] = useState(event?.description ?? '');
  const [type, setType] = useState<EventType>(event?.event_type ?? 'SERVICE_PROJECT');
  const [selectedCoOrganizers, setSelectedCoOrganizers] = useState<string[]>(event?.co_organizer_user_ids ?? []);
  const [coOrgQuery, setCoOrgQuery] = useState('');
  const [isCoOrgFocused, setIsCoOrgFocused] = useState(false);
  const coOrgInputRef = useRef<TextInput>(null);

  const [location, setLocation] = useState<LocationValue>({
    address: event?.address ?? '',
    city: event?.city ?? '',
    latitude: event?.latitude ?? 14.5266,
    longitude: event?.longitude ?? 121.1553,
  });
  const [areasOfFocus, setAreasOfFocus] = useState<AreaOfFocus[]>(event?.areas_of_focus ?? []);
  const [coverPhoto, setCoverPhoto] = useState<string | undefined>(event?.cover_photo);
  const [maxP, setMaxP] = useState(String(event?.max_participants ?? 50));
  const [visibility, setVisibility] = useState<EventVisibility>(event?.visibility ?? 'VERIFIED_ROTARACTORS');
  const [requiresApproval, setRequiresApproval] = useState(event?.requires_approval ?? false);
  const [allocation, setAllocation] = useState<ClubAllocationValue>({
    mode: event?.allocation_mode ?? 'NONE',
    defaultSlots: event?.default_club_allocation != null ? String(event.default_club_allocation) : '5',
    // Derived back from the stored deadline so reopening the form shows what
    // was actually saved rather than snapping to the default.
    releaseHoursBefore: event?.allocation_release_at && event?.start_datetime
      ? Math.max(1, Math.round(
          (new Date(event.start_datetime).getTime() - new Date(event.allocation_release_at).getTime()) / 3600000))
      : 24,
  });
  const [cohosting, setCohosting] = useState<CohostingValue>({
    enabled: event?.cohosting_enabled ?? false,
    feePesos: event?.cohosting_fee_centavos != null ? String(Math.round(event.cohosting_fee_centavos / 100)) : '500',
    maxClubs: event?.cohosting_max_clubs != null ? String(event.cohosting_max_clubs) : '',
    requiresApproval: event?.cohosting_requires_approval ?? true,
    benefits: event?.cohosting_benefits ?? '',
    // Derived back from the stored deadline so re-opening shows what was saved.
    deadlineHoursBefore: event?.cohosting_application_deadline && event?.start_datetime
      ? Math.max(1, Math.round(
          (new Date(event.start_datetime).getTime() - new Date(event.cohosting_application_deadline).getTime()) / 3600000))
      : 48,
  });
  const [allowInvites, setAllowInvites] = useState(event?.allow_participant_invites ?? true);
  const [lockCutoffHours, setLockCutoffHours] = useState<number>(event?.lock_leave_cutoff_hours ?? 24);
  const [geofenceRadius, setGeofenceRadius] = useState<number>(event?.geofence_radius_meters ?? 300);
  const [contactNumber, setContactNumber] = useState(event?.contact_number ?? '');
  const [contactEmail, setContactEmail] = useState(event?.contact_email ?? '');
  const [confirmSaveVisible, setConfirmSaveVisible] = useState(false);
  const pendingUpdates = useRef<Partial<RotaractEvent> | null>(null);

  // Schedule. Held as a date plus two times, mirroring CreateEventScreen, so the
  // two screens agree on what a "schedule" is and the same validation applies.
  const [eventDate, setEventDate] = useState<Date>(() => new Date(event?.start_datetime ?? Date.now()));
  const [startTime, setStartTime] = useState<Date | null>(() => (event ? new Date(event.start_datetime) : null));
  const [endTime, setEndTime] = useState<Date | null>(() => (event ? new Date(event.end_datetime) : null));
  const [endTimeError, setEndTimeError] = useState<string | null>(null);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [activePickerTarget, setActivePickerTarget] = useState<'startTime' | 'endTime' | null>(null);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDesc(event.description);
      setType(event.event_type);
      setSelectedCoOrganizers(event.co_organizer_user_ids ?? []);
      setLocation({
        address: event.address,
        city: event.city,
        latitude: event.latitude,
        longitude: event.longitude,
      });
      setAreasOfFocus(event.areas_of_focus ?? []);
      setCoverPhoto(event.cover_photo);
      setMaxP(String(event.max_participants));
      setVisibility(event.visibility);
      setRequiresApproval(event.requires_approval);
      setAllowInvites(event.allow_participant_invites);
      setLockCutoffHours(event.lock_leave_cutoff_hours ?? 24);
      setGeofenceRadius(event.geofence_radius_meters ?? 300);
      setContactNumber(event.contact_number ?? '');
      setContactEmail(event.contact_email ?? '');
      setEventDate(new Date(event.start_datetime));
      setStartTime(new Date(event.start_datetime));
      setEndTime(new Date(event.end_datetime));
    }
  }, [event]);

  if (!event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
        <Text style={{ padding: 20, color: themeColors.text }}>Event not found.</Text>
      </SafeAreaView>
    );
  }

  const policy = eventEditPolicy(event, user, users, participantsFor(eventId));

  // Rendered in-screen rather than as an alert so the reason is always visible,
  // on every platform, including when the screen is reached by a deep link.
  if (!policy.canEdit) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom', 'left', 'right']}>
        <View style={styles.lockedWrap}>
          <View style={[styles.lockedIcon, { backgroundColor: themeColors.surface }]}>
            <Ionicons name="lock-closed" size={28} color={themeColors.textMuted} />
          </View>
          <Text style={[styles.lockedTitle, { color: themeColors.text }]}>Editing Disabled</Text>
          <Text style={[styles.lockedReason, { color: themeColors.textMuted }]}>{policy.blockedReason}</Text>
          <TouchableOpacity style={[styles.lockedBtn, { backgroundColor: themeColors.primary }]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={styles.lockedBtnText}>Back to Event</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const lockNotes = [...new Set(Object.values(policy.lockedFields).filter(Boolean) as string[])];

  const isServiceProject = type === 'SERVICE_PROJECT';

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

  const combine = (dateObj: Date, timeObj: Date | null) => {
    if (!timeObj) return null;
    const c = new Date(dateObj);
    c.setHours(timeObj.getHours(), timeObj.getMinutes(), 0, 0);
    return c;
  };

  const handlePickerChange = (e: DateTimePickerEvent, selected?: Date) => {
    const target = activePickerTarget;
    if (Platform.OS === 'android') setActivePickerTarget(null);
    if (e.type !== 'set' || !selected || !target) return;
    if (target === 'startTime') {
      setStartTime(selected);
      setEndTimeError(endTime && endTime <= selected ? 'End time must be after start time' : null);
    } else {
      setEndTime(selected);
      setEndTimeError(startTime && selected <= startTime ? 'End time must be after start time' : null);
    }
  };

  /** Build the update payload from current form state, respecting field locks. */
  const buildUpdates = useCallback(() => {
    const requested = parseInt(maxP, 10) || 50;
    const coOrgClubIds = selectedCoOrganizers
      .map(id => users.find(u => u.id === id)?.club_id)
      .filter((id): id is string => Boolean(id));
    const involvedClubIds = Array.from(new Set([
      event?.organizing_club_id ?? user?.club_id ?? '',
      ...coOrgClubIds,
    ])).filter(Boolean);

    return {
      title,
      description: desc,
      event_type: type,
      co_organizer_user_ids: selectedCoOrganizers,
      participating_club_ids: involvedClubIds,
      // Guarded like location: when the schedule is frozen the stored value is
      // resent unchanged, so a locked field can never be written from form state.
      start_datetime: policy.lockedFields.schedule
        ? event.start_datetime
        : (combine(eventDate, startTime) ?? new Date(event.start_datetime)).toISOString(),
      end_datetime: policy.lockedFields.schedule
        ? event.end_datetime
        : (combine(eventDate, endTime) ?? new Date(event.end_datetime)).toISOString(),
      latitude: policy.lockedFields.location ? event.latitude : location.latitude,
      longitude: policy.lockedFields.location ? event.longitude : location.longitude,
      address: policy.lockedFields.location ? event.address : location.address,
      city: policy.lockedFields.location ? event.city : location.city,
      max_participants: requested,
      // District events: forced open-to-all, no join approval, no participant invites.
      requires_approval: type === 'DISTRICT_EVENT' ? false : (policy.lockedFields.requiresApproval ? event.requires_approval : requiresApproval),
      allow_participant_invites: type === 'DISTRICT_EVENT' ? false : allowInvites,
      visibility: type === 'DISTRICT_EVENT' ? 'VERIFIED_ROTARACTORS' : visibility,
      cover_photo: coverPhoto,
      contact_number: contactNumber.trim() || undefined,
      contact_email: contactEmail.trim() || undefined,
      areas_of_focus: isServiceProject ? areasOfFocus : undefined,
      lock_leave_cutoff_hours: lockCutoffHours,
      geofence_radius_meters: geofenceRadius,
      ...allocationFieldsToEvent(
        allocation,
        policy.lockedFields.schedule
          ? event.start_datetime
          : (combine(eventDate, startTime) ?? new Date(event.start_datetime)).toISOString(),
      ),
      ...cohostingFieldsToEvent(
        cohosting,
        policy.lockedFields.schedule
          ? event.start_datetime
          : (combine(eventDate, startTime) ?? new Date(event.start_datetime)).toISOString(),
      ),
    };
  }, [title, desc, type, selectedCoOrganizers, location, maxP, eventDate, startTime, endTime, requiresApproval, allowInvites, visibility, coverPhoto, contactNumber, contactEmail, areasOfFocus, lockCutoffHours, geofenceRadius, allocation, cohosting, isServiceProject, policy, event, users, user]);

  /** Commit the given updates (or current form state) and navigate back. */
  const performSave = useCallback((updates: Partial<RotaractEvent>) => {
    if (!user) return;
    const clearsApprovals = policy.approvalsAtRisk > 0 && isMaterialChange(event, updates);

    updateEvent(eventId, updates);
    if (clearsApprovals) resetEventApprovals(eventId, user);

    Alert.alert(
      'Event Updated!',
      clearsApprovals
        ? `Your changes have been saved. Because the schedule, venue, team or event type changed, the ${policy.approvalsAtRisk} approval${policy.approvalsAtRisk === 1 ? '' : 's'} already given ${policy.approvalsAtRisk === 1 ? 'was' : 'were'} cleared and every club President has been asked to approve again.`
        : 'Your changes have been saved.',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  }, [user, policy, event, eventId, updateEvent, resetEventApprovals, navigation]);

  const handleSave = () => {
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
    // Only meaningful while the schedule is editable; a locked schedule resends the
    // stored value and cannot be invalid.
    if (!policy.lockedFields.schedule) {
      const s = combine(eventDate, startTime);
      const e = combine(eventDate, endTime);
      if (!s || !e) {
        Alert.alert('Missing Schedule', 'Please set both a start and an end time for this event.');
        return;
      }
      if (e <= s) {
        Alert.alert('Invalid Schedule', 'The end time must be after the start time.');
        return;
      }
    }
    if (!user) return;

    const requested = parseInt(maxP, 10) || 50;
    if (requested < policy.minParticipants) {
      Alert.alert(
        'Too Few Slots',
        `Capacity cannot go below ${policy.minParticipants} — that many members have already joined.`,
      );
      return;
    }

    // Locked fields keep their stored values no matter what is in local state.
    const updates = buildUpdates();
    const wouldClearApprovals = policy.approvalsAtRisk > 0 && isMaterialChange(event, updates);

    if (wouldClearApprovals) {
      // Stash the payload and show the confirmation modal so the organizer
      // understands they're about to wipe existing Presidential approvals.
      pendingUpdates.current = updates;
      setConfirmSaveVisible(true);
    } else {
      performSave(updates);
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
          {(lockNotes.length > 0 || policy.approvalsAtRisk > 0) && (
            <View style={[styles.policyBanner, { backgroundColor: isNightMode ? '#451A0344' : '#FFFBEB', borderColor: isNightMode ? '#F59E0B66' : '#FDE68A' }]}>
              <View style={styles.policyHeader}>
                <Ionicons name="information-circle" size={18} color={isNightMode ? '#FBBF24' : '#D97706'} />
                <Text style={[styles.policyTitle, { color: isNightMode ? '#FCD34D' : '#92400E' }]}>Some details are locked</Text>
              </View>
              {lockNotes.map(note => (
                <Text key={note} style={[styles.policyNote, { color: isNightMode ? '#FDE68A' : '#78350F' }]}>• {note}</Text>
              ))}
              {policy.approvalsAtRisk > 0 && (
                <Text style={[styles.policyNote, { color: isNightMode ? '#FDE68A' : '#78350F' }]}>
                  • {policy.approvalsAtRisk} club President {policy.approvalsAtRisk === 1 ? 'has' : 'have'} already
                  approved this event. Changing the venue, team, capacity, visibility or event type will clear
                  {policy.approvalsAtRisk === 1 ? ' that approval' : ' those approvals'} and require everyone to approve again.
                </Text>
              )}
            </View>
          )}

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

            <Field label="Event Name" value={title} onChangeText={setTitle} placeholder="Community Coastal Cleanup" />
            <Field label="Description" value={desc} onChangeText={setDesc} placeholder="What's this project about?" multiline numberOfLines={4} />
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
            {policy.lockedFields.schedule ? (
              <View style={[styles.fieldLockCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={styles.fieldLockHeader}>
                  <Ionicons name="lock-closed" size={14} color={themeColors.textMuted} />
                  <Text style={[styles.fieldLockTitle, { color: themeColors.text }]}>Schedule locked</Text>
                </View>
                <Text style={[styles.fieldLockText, { color: themeColors.textMuted }]}>{policy.lockedFields.schedule}</Text>
                <Text style={[styles.fieldLockValue, { color: themeColors.text }]}>
                  {new Date(event.start_datetime).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                  {' — '}
                  {new Date(event.end_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            ) : (
              <>
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

                <View style={styles.timeGridRow}>
                  <SegmentedTimeInput
                    label="Start time"
                    value={startTime}
                    baseDate={eventDate}
                    onChangeTime={newTime => {
                      setStartTime(newTime);
                      setEndTimeError(endTime && endTime <= newTime ? 'End time must be after start time' : null);
                    }}
                    onOpenPicker={() => setActivePickerTarget('startTime')}
                  />
                  <SegmentedTimeInput
                    label="End time"
                    value={endTime}
                    baseDate={eventDate}
                    onChangeTime={newTime => {
                      setEndTime(newTime);
                      setEndTimeError(startTime && newTime <= startTime ? 'End time must be after start time' : null);
                    }}
                    onOpenPicker={() => setActivePickerTarget('endTime')}
                    error={endTimeError}
                  />
                </View>

                <CalendarGridModal
                  visible={calendarModalVisible}
                  selectedDate={eventDate}
                  onSelectDate={d => setEventDate(d)}
                  onClose={() => setCalendarModalVisible(false)}
                />

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
                        (activePickerTarget === 'startTime' ? startTime : endTime)
                          ?? new Date(activePickerTarget === 'startTime' ? event.start_datetime : event.end_datetime)
                      }
                      mode="time"
                      is24Hour={false}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handlePickerChange}
                    />
                  </View>
                )}
              </>
            )}

            {policy.lockedFields.location ? (
              <View style={[styles.fieldLockCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <View style={styles.fieldLockHeader}>
                  <Ionicons name="lock-closed" size={14} color={themeColors.textMuted} />
                  <Text style={[styles.fieldLockTitle, { color: themeColors.text }]}>Venue locked</Text>
                </View>
                <Text style={[styles.fieldLockText, { color: themeColors.textMuted }]}>{policy.lockedFields.location}</Text>
                <Text style={[styles.fieldLockValue, { color: themeColors.text }]}>{event.address}, {event.city}</Text>
              </View>
            ) : (
              <>
                <LocationPicker value={location} onChange={setLocation} geofenceRadius={geofenceRadius} />

                {/* Check-In Geofence Perimeter Radius */}
                <Text style={[styles.label, { color: themeColors.text }]}>Check-In Geofence Perimeter</Text>
                <Text style={[styles.subHint, { color: themeColors.textMuted }]}>
                  Participants within this {geofenceRadius}m radius can verify attendance with 1-tap GPS check-in.
                </Text>
                <View style={styles.radiusPillsRow}>
                  {[
                    { label: '100m (Indoor)', value: 100 },
                    { label: '300m (Standard)', value: 300 },
                    { label: '500m (Outdoor)', value: 500 },
                  ].map(r => {
                    const isSelected = geofenceRadius === r.value;
                    return (
                      <TouchableOpacity
                        key={r.value}
                        activeOpacity={0.7}
                        style={[
                          styles.radiusPill,
                          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                          isSelected && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                        ]}
                        onPress={() => setGeofenceRadius(r.value)}
                      >
                        <Ionicons
                          name={isSelected ? 'shield-checkmark' : 'ellipse-outline'}
                          size={13}
                          color={isSelected ? '#fff' : themeColors.textMuted}
                        />
                        <Text
                          style={[
                            styles.radiusPillText,
                            { color: themeColors.text },
                            isSelected && styles.radiusPillTextActive,
                          ]}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </SectionCard>

          {/* SECTION 3: Access & Capacity */}
          <SectionCard
            icon="shield-checkmark-outline"
            title="Access & Capacity"
            subtitle="Attendee limits, visibility, and sign-up rules"
          >
            <Field label="Max Participants" value={maxP} onChangeText={setMaxP} keyboardType="number-pad" placeholder="50" />
            {!!policy.lockedFields.maxParticipants && (
              <Text style={[styles.fieldNote, { color: themeColors.textMuted }]}>{policy.lockedFields.maxParticipants}</Text>
            )}

            {type === 'DISTRICT_EVENT' ? (
              <View style={[styles.districtInfoRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Ionicons name="globe-outline" size={16} color={themeColors.primary} />
                <Text style={[styles.districtInfoText, { color: themeColors.textMuted }]}>
                  Open to all verified members. This district event invites everyone in the district.
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
                        <Text style={[styles.visChipText, { color: themeColors.text }, active && styles.visChipTextActive]}>{v.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={[styles.label, { color: themeColors.text }]}>Lock Leave Cutoff</Text>
            <Text style={[styles.subHint, { color: themeColors.textMuted }]}>
              Prevent attendees from leaving within {lockCutoffHours}h before start time to avoid last-minute drops.
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
                    <Text style={[styles.visChipText, { color: themeColors.text }, active && styles.visChipTextActive]}>{hrs}h</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {type !== 'DISTRICT_EVENT' && (
              <View style={styles.togglesGroup}>
                {policy.lockedFields.requiresApproval ? (
                  <View style={[styles.fieldLockCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <View style={styles.fieldLockHeader}>
                      <Ionicons name="lock-closed" size={14} color={themeColors.textMuted} />
                      <Text style={[styles.fieldLockTitle, { color: themeColors.text }]}>
                        Join approval: {event.requires_approval ? 'required' : 'not required'}
                      </Text>
                    </View>
                    <Text style={[styles.fieldLockText, { color: themeColors.textMuted }]}>{policy.lockedFields.requiresApproval}</Text>
                  </View>
                ) : (
                  <SettingToggleRow
                    icon="person-add-outline"
                    label="Require Organizer Approval"
                    subtitle="Review and approve participant requests before confirming them"
                    value={requiresApproval}
                    onChange={setRequiresApproval}
                  />
                )}
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
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Ionicons name="save" size={18} color="#fff" />
              <Text style={styles.submitText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </KeyboardAwareScrollView>

      <ConfirmRulesModal
        visible={confirmSaveVisible}
        title="This Will Clear Approvals"
        intro={`${policy.approvalsAtRisk} club President${policy.approvalsAtRisk === 1 ? ' has' : 's have'} already approved this event. Your changes to the venue, team, capacity, visibility or event type will clear ${policy.approvalsAtRisk === 1 ? 'that approval' : 'those approvals'} and send it back for re-approval.`}
        rules={[
          'All existing club President approvals will be cleared.',
          'Every involved club President will be notified and asked to review the updated event again.',
          'The event will remain in PENDING APPROVAL status until all Presidents re-approve.',
          'Cosmetic changes (title, description, cover photo, contacts) do not trigger this.',
        ]}
        confirmLabel="Save & Clear Approvals"
        confirmIcon="save"
        onConfirm={() => {
          setConfirmSaveVisible(false);
          if (pendingUpdates.current) {
            performSave(pendingUpdates.current);
            pendingUpdates.current = null;
          }
        }}
        onCancel={() => {
          setConfirmSaveVisible(false);
          pendingUpdates.current = null;
        }}
      />
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
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: themeColors.border, true: themeColors.primary + '80' }}
        thumbColor={value ? themeColors.primary : '#f4f3f4'}
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
  safe: { flex: 1 },
  container: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 },

  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  lockedIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { fontSize: 18, fontWeight: '800' },
  lockedReason: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  lockedBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginTop: 8 },
  lockedBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

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

  policyBanner: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8, gap: 6 },
  policyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  policyTitle: { fontSize: 14, fontWeight: '800' },
  policyNote: { fontSize: 12, lineHeight: 17 },

  fieldLockCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 4, gap: 4 },
  fieldLockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLockTitle: { fontSize: 13, fontWeight: '700' },
  fieldLockText: { fontSize: 11, lineHeight: 16 },
  fieldLockValue: { fontSize: 13, marginTop: 2 },
  fieldNote: { fontSize: 11, fontStyle: 'italic', marginTop: 2 },

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
    marginBottom: 16,
    marginTop: 4,
  },
  radiusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  radiusPillActive: {
  },
  radiusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  radiusPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
