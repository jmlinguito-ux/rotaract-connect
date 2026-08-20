import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Platform, Keyboard, Pressable } from 'react-native';
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
import { AreasOfFocusPicker } from '../../components/AreasOfFocusPicker';
import { CoverPhotoPicker } from '../../components/CoverPhotoPicker';
import { CalendarGridModal } from '../../components/CalendarGridModal';
import { SegmentedTimeInput } from '../../components/SegmentedTimeInput';
import { ConfirmRulesModal } from '../../components/ConfirmRulesModal';
import { editLockRulesForSubmit } from '../../utils/eventEditPolicy';
import { KeyboardAwareScrollView, useKeyboardAwareOnFocus } from '../../components/KeyboardAwareScrollView';

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

  const [selectedPartnerClubs, setSelectedPartnerClubs] = useState<string[]>([]);
  const [partnerClubQuery, setPartnerClubQuery] = useState('');
  const [isPartnerClubFocused, setIsPartnerClubFocused] = useState(false);

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
      ...selectedPartnerClubs,
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
    const involvedClubIds = Array.from(new Set([
      user.club_id,
      ...selectedPartnerClubs,
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
          style={{ flex: 1 }}
          onPress={() => {
            Keyboard.dismiss();
            setIsCoOrgFocused(false);
            setCoOrgQuery('');
          }}
        >
          <CoverPhotoPicker value={coverPhoto} onChange={setCoverPhoto} />

          <Text style={[styles.label, { color: themeColors.text }]}>Event Type</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[styles.typeCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, type === 'SERVICE_PROJECT' && styles.typeCardActive]}
              onPress={() => setType('SERVICE_PROJECT')}
            >
              <FontAwesome5 name="hands-helping" size={16} color={type === 'SERVICE_PROJECT' ? '#fff' : themeColors.primary} />
              <Text style={[styles.typeText, { color: themeColors.text }, type === 'SERVICE_PROJECT' && styles.typeTextActive]}>Service Project</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, type === 'FELLOWSHIP' && styles.typeCardActive]}
              onPress={() => setType('FELLOWSHIP')}
            >
              <Ionicons name="people" size={18} color={type === 'FELLOWSHIP' ? '#fff' : themeColors.primary} />
              <Text style={[styles.typeText, { color: themeColors.text }, type === 'FELLOWSHIP' && styles.typeTextActive]}>Fellowship</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typeCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }, type === 'DISTRICT_EVENT' && { backgroundColor: '#C9A227', borderColor: '#C9A227' }]}
              onPress={() => setType('DISTRICT_EVENT')}
            >
              <Ionicons name="ribbon" size={18} color={type === 'DISTRICT_EVENT' ? '#fff' : '#C9A227'} />
              <Text style={[styles.typeText, { color: themeColors.text }, type === 'DISTRICT_EVENT' && styles.typeTextActive]}>District Event</Text>
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

          {/* Involved Co-Organizers & Team Members Picker (Moved Below Description) */}
          <Text style={styles.label}>Involved Co-Organizers & Team Members</Text>

          {/* Tag Input Container Box with Inline Pills */}
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
                <View key={u.id} style={styles.tagPill}>
                  <Text style={styles.tagPillText}>{pillLabel}</Text>
                  <TouchableOpacity
                    onPress={() => setSelectedCoOrganizers(prev => prev.filter(selectedId => selectedId !== id))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={13} color={colors.primary} />
                  </TouchableOpacity>
                </View>
              );
            })}

            <TextInput
              ref={coOrgInputRef}
              style={styles.inlineTagInput}
              placeholder={selectedCoOrganizers.length === 0 ? "Type member's name..." : (isCoOrgFocused ? "Add another..." : "")}
              placeholderTextColor={colors.textMuted}
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

          {/* Partner / Co-Hosting Clubs */}
          <Text style={[styles.label, { color: themeColors.text }]}>Co-Hosting Partner Clubs (Optional)</Text>
          <Text style={[styles.subHint, { color: themeColors.textMuted }]}>
            Select partner clubs co-hosting this project. Their Club Presidents will be notified for joint approval.
          </Text>

          {selectedPartnerClubs.length > 0 && (
            <View style={styles.selectedPillsRow}>
              {selectedPartnerClubs.map(cid => {
                const clb = clubs.find(c => c.id === cid);
                if (!clb) return null;
                return (
                  <View key={cid} style={[styles.selectedPill, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <Text style={[styles.selectedPillText, { color: themeColors.text }]}>{clb.club_name.replace('Rotaract Club of ', '')}</Text>
                    <TouchableOpacity onPress={() => setSelectedPartnerClubs(prev => prev.filter(id => id !== cid))}>
                      <Ionicons name="close-circle" size={16} color={themeColors.textMuted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.coOrgSearchWrap}>
            <TextInput
              style={[
                styles.input,
                styles.coOrgSearchInput,
                { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                isPartnerClubFocused && { borderColor: themeColors.primary, borderWidth: 1.5 },
              ]}
              placeholder="Search clubs to add as co-hosts..."
              placeholderTextColor={themeColors.textMuted}
              value={partnerClubQuery}
              onChangeText={setPartnerClubQuery}
              onFocus={() => setIsPartnerClubFocused(true)}
              onBlur={() => setIsPartnerClubFocused(false)}
            />
            {isPartnerClubFocused && partnerClubQuery.trim().length > 0 && (
              <View style={[styles.coOrgDropdown, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border, zIndex: 3 }]}>
                {clubs
                  .filter(c => {
                    if (c.id === user?.club_id) return false;
                    if (selectedPartnerClubs.includes(c.id)) return false;
                    return c.club_name.toLowerCase().includes(partnerClubQuery.toLowerCase());
                  })
                  .slice(0, 5)
                  .map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.coOrgDropdownItem, { borderBottomColor: themeColors.border }]}
                      onPress={() => {
                        setSelectedPartnerClubs(prev => [...prev, c.id]);
                        setPartnerClubQuery('');
                        Keyboard.dismiss();
                        setIsPartnerClubFocused(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.coOrgItemName, { color: themeColors.text }]}>{c.club_name}</Text>
                        <Text style={[styles.coOrgItemSub, { color: themeColors.textMuted }]}>{c.city}, {c.province}</Text>
                      </View>
                      <Ionicons name="add-circle" size={18} color={themeColors.primary} />
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </View>

          {/* Date Selector Input Box */}
          <Text style={[styles.label, { color: themeColors.text }]}>Date</Text>
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

          {/* Side-by-Side 3-Segment Time Inputs (Initial --:-- --) */}
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
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerHeaderTitle}>
                  Select {activePickerTarget === 'startTime' ? 'Start Time' : 'End Time'}
                </Text>
                <TouchableOpacity style={styles.pickerDoneBtn} onPress={() => setActivePickerTarget(null)}>
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

          <LocationPicker value={location} onChange={setLocation} geofenceRadius={geofenceRadius} />

          {/* Check-In Geofence Perimeter Radius */}
          <Text style={styles.label}>Check-In Geofence Perimeter</Text>
          <Text style={styles.subHint}>
            Participants entering this {geofenceRadius}m radius during the event window will check in automatically.
          </Text>
          <View style={styles.radiusPillsRow}>
            {[
              { label: '100m (Indoor)', value: 100 },
              { label: '300m (Standard)', value: 300 },
              { label: '500m (Campus)', value: 500 },
              { label: '1km (District)', value: 1000 },
            ].map(r => {
              const isSelected = geofenceRadius === r.value;
              return (
                <TouchableOpacity
                  key={r.value}
                  activeOpacity={0.7}
                  style={[
                    styles.radiusPill,
                    isSelected && styles.radiusPillActive,
                  ]}
                  onPress={() => setGeofenceRadius(r.value)}
                >
                  <Ionicons
                    name={isSelected ? 'shield-checkmark' : 'ellipse-outline'}
                    size={13}
                    color={isSelected ? '#fff' : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.radiusPillText,
                      isSelected && styles.radiusPillTextActive,
                    ]}
                  >
                    {r.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Field label="Max Participants" value={maxP} onChangeText={setMaxP} keyboardType="number-pad" placeholder="50" />
          <Field label="Contact Number" value={contactNumber} onChangeText={handleContactNumberChange} keyboardType="phone-pad" placeholder="0917 123 4567" maxLength={13} />
          <Field label="Contact Email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" placeholder="event@rotaract.org" />

          {/* District events are always open to every verified member and, on
              publish, invite the whole district — so visibility/approval/invite
              controls are hidden for them. */}
          {type === 'DISTRICT_EVENT' ? (
            <View style={styles.districtInfoRow}>
              <Ionicons name="globe-outline" size={15} color={colors.textMuted} />
              <Text style={styles.districtInfoText}>
                Open to all verified members. Publishing invites everyone in the district.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Visibility</Text>
              <View style={styles.visRow}>
                {([
                  { key: 'VERIFIED_ROTARACTORS', label: 'Verified' },
                  { key: 'CLUB_ONLY', label: 'Club only' },
                  { key: 'INVITATION_ONLY', label: 'Invite only' },
                ] as { key: EventVisibility; label: string }[]).map(v => (
                  <TouchableOpacity key={v.key} onPress={() => setVisibility(v.key)} style={[styles.visChip, visibility === v.key && styles.visChipActive]}>
                    <Text style={[styles.visChipText, visibility === v.key && styles.visChipTextActive]}>{v.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>Lock Leave Cutoff (Hours Before Start)</Text>
          <View style={styles.visRow}>
            {[6, 12, 24].map(hrs => (
              <TouchableOpacity key={hrs} onPress={() => setLockCutoffHours(hrs)} style={[styles.visChip, lockCutoffHours === hrs && styles.visChipActive]}>
                <Text style={[styles.visChipText, lockCutoffHours === hrs && styles.visChipTextActive]}>{hrs}h</Text>
              </TouchableOpacity>
            ))}
          </View>

          {type !== 'DISTRICT_EVENT' && (
            <>
              <Toggle label="Requires organizer approval to join" value={requiresApproval} onChange={setRequiresApproval} />
              <Toggle label="Participants can invite others" value={allowInvites} onChange={setAllowInvites} />
            </>
          )}

          <TouchableOpacity style={styles.submitBtn} onPress={submit}>
            <Ionicons name="add-circle" size={20} color="#fff" />
            <Text style={styles.submitText}>Publish Event</Text>
          </TouchableOpacity>
        </Pressable>
      </KeyboardAwareScrollView>

      <ConfirmRulesModal
        visible={confirmVisible}
        title="Before You Submit"
        intro="Once submitted, some details become locked to protect participants who join. Review the rules below."
        rules={editLockRulesForSubmit(lockCutoffHours, type !== 'DISTRICT_EVENT')}
        confirmLabel="Submit Event"
        confirmIcon="send"
        onConfirm={performCreate}
        onCancel={() => setConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}

function Field({ label, ...rest }: any) {
  const { colors: themeColors } = useTheme();
  const [focused, setFocused] = useState(false);
  const onFocusAware = useKeyboardAwareOnFocus();
  return (
    <>
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
    </>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors: themeColors } = useTheme();
  return (
    <TouchableOpacity style={[styles.toggleRow, { borderBottomColor: themeColors.border }]} onPress={() => onChange(!value)}>
      <Text style={[styles.toggleLabel, { color: themeColors.text }]}>{label}</Text>
      <View style={[styles.toggle, { backgroundColor: themeColors.border }, value && [styles.toggleOn, { backgroundColor: themeColors.primary }]]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 15, backgroundColor: colors.surface, color: colors.text },
  inputFocused: { borderWidth: 1.5, borderColor: colors.primary },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeCard: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 },
  typeCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { fontSize: 11, fontWeight: '700', color: colors.text, textAlign: 'center' },
  typeTextActive: { color: '#fff' },
  districtInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  districtInfoText: { fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 16 },
  subLabelHint: { fontSize: 11, color: colors.textMuted, marginBottom: 8 },
  pillBoxContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 10,
    minHeight: 52,
    backgroundColor: colors.surface,
    marginBottom: 6,
  },
  pillBoxFocused: {
    borderColor: colors.primary,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary + '14',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  inlineTagInput: {
    flex: 1,
    minWidth: 110,
    fontSize: 14,
    color: colors.text,
    padding: 0,
    height: 28,
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
  coOrgDropdown: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 12 },
  coOrgDropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  coOrgItemAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  coOrgItemAvatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coOrgItemName: { fontSize: 13, fontWeight: '700', color: colors.text },
  coOrgItemSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  noMatchText: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic', padding: 12, textAlign: 'center' },
  visRow: { flexDirection: 'row', gap: 8 },
  visChip: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  visChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  visChipText: { fontSize: 12, fontWeight: '700', color: colors.text },
  visChipTextActive: { color: '#fff' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggleLabel: { flex: 1, fontSize: 14, color: colors.text, paddingRight: 12 },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.border, padding: 2 },
  toggleOn: { backgroundColor: colors.primary },
  toggleKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleKnobOn: { transform: [{ translateX: 18 }] },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, padding: 16, borderRadius: 12, marginTop: 28 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Date & Time input box styles
  inputBoxWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    backgroundColor: colors.surface,
  },
  inputBoxText: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.text,
  },
  timeGridRow: {
    flexDirection: 'row',
    gap: 12,
  },
  subHint: { fontSize: 12, marginBottom: 8, marginTop: -2 },
  selectedPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectedPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  selectedPillText: { fontSize: 12, fontWeight: '600' },
  coOrgSearchWrap: { marginBottom: 12 },
  coOrgSearchInput: { height: 44, paddingHorizontal: 12 },
  pickerContainer: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginTop: 10, padding: 12, overflow: 'hidden' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 },
  pickerHeaderTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  pickerDoneBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  pickerDoneText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Geofence radius pills
  radiusPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  radiusPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  radiusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  radiusPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
});
