import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, Keyboard, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { AreaOfFocus, EventType, EventVisibility } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../navigation/types';
import { LocationPicker } from '../../components/LocationPicker';
import { LocationValue } from '../../components/location/shared';
import { AreasOfFocusPicker } from '../../components/AreasOfFocusPicker';
import { CoverPhotoPicker } from '../../components/CoverPhotoPicker';
import { eventEditPolicy, isMaterialChange } from '../../utils/eventEditPolicy';
import { ConfirmRulesModal } from '../../components/ConfirmRulesModal';
import type { RotaractEvent } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditEvent'>;

export default function EditEventScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  const { events, updateEvent, users, participantsFor, resetEventApprovals } = useData();

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
  const [allowInvites, setAllowInvites] = useState(event?.allow_participant_invites ?? true);
  const [lockCutoffHours, setLockCutoffHours] = useState<number>(event?.lock_leave_cutoff_hours ?? 24);
  const [contactNumber, setContactNumber] = useState(event?.contact_number ?? '');
  const [contactEmail, setContactEmail] = useState(event?.contact_email ?? '');
  const [confirmSaveVisible, setConfirmSaveVisible] = useState(false);
  const pendingUpdates = useRef<Partial<RotaractEvent> | null>(null);

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
      setContactNumber(event.contact_number ?? '');
      setContactEmail(event.contact_email ?? '');
    }
  }, [event]);

  if (!event) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={{ padding: 20, color: colors.text }}>Event not found.</Text>
      </SafeAreaView>
    );
  }

  const policy = eventEditPolicy(event, user, users, participantsFor(eventId));

  // Rendered in-screen rather than as an alert so the reason is always visible,
  // on every platform, including when the screen is reached by a deep link.
  if (!policy.canEdit) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <View style={styles.lockedWrap}>
          <View style={styles.lockedIcon}>
            <Ionicons name="lock-closed" size={28} color={colors.textMuted} />
          </View>
          <Text style={styles.lockedTitle}>Editing Disabled</Text>
          <Text style={styles.lockedReason}>{policy.blockedReason}</Text>
          <TouchableOpacity style={styles.lockedBtn} onPress={() => navigation.goBack()}>
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

  /** Build the update payload from current form state, respecting field locks. */
  const buildUpdates = useCallback(() => {
    const requested = parseInt(maxP, 10) || 50;
    return {
      title,
      description: desc,
      event_type: type,
      co_organizer_user_ids: selectedCoOrganizers,
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
    };
  }, [title, desc, type, selectedCoOrganizers, location, maxP, requiresApproval, allowInvites, visibility, coverPhoto, contactNumber, contactEmail, areasOfFocus, lockCutoffHours, isServiceProject, policy, event]);

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
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={true}
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
          {(lockNotes.length > 0 || policy.approvalsAtRisk > 0) && (
            <View style={styles.policyBanner}>
              <View style={styles.policyHeader}>
                <Ionicons name="information-circle" size={18} color={colors.warning} />
                <Text style={styles.policyTitle}>Some details are locked</Text>
              </View>
              {lockNotes.map(note => (
                <Text key={note} style={styles.policyNote}>• {note}</Text>
              ))}
              {policy.approvalsAtRisk > 0 && (
                <Text style={styles.policyNote}>
                  • {policy.approvalsAtRisk} club President {policy.approvalsAtRisk === 1 ? 'has' : 'have'} already
                  approved this event. Changing the venue, team, capacity, visibility or event type will clear
                  {policy.approvalsAtRisk === 1 ? ' that approval' : ' those approvals'} and require everyone to approve again.
                </Text>
              )}
            </View>
          )}

          <CoverPhotoPicker value={coverPhoto} onChange={setCoverPhoto} />

          <Field label="Event Name" value={title} onChangeText={setTitle} placeholder="Community Coastal Cleanup" />
          <Field label="Description" value={desc} onChangeText={setDesc} placeholder="What's this project about?" multiline numberOfLines={4} />
          {isServiceProject && <AreasOfFocusPicker selected={areasOfFocus} onChange={setAreasOfFocus} />}

          {/* Involved Co-Organizers & Team Members Picker (Moved Below Description) */}
          <Text style={styles.label}>Involved Co-Organizers & Team Members</Text>

          {/* Tag Input Container Box with Inline Pills */}
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.pillBoxContainer, isCoOrgFocused && styles.pillBoxFocused]}
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

          {policy.lockedFields.location ? (
            <View style={styles.fieldLockCard}>
              <View style={styles.fieldLockHeader}>
                <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                <Text style={styles.fieldLockTitle}>Venue locked</Text>
              </View>
              <Text style={styles.fieldLockText}>{policy.lockedFields.location}</Text>
              <Text style={styles.fieldLockValue}>{event.address}, {event.city}</Text>
            </View>
          ) : (
            <LocationPicker value={location} onChange={setLocation} />
          )}

          <Field label="Max Participants" value={maxP} onChangeText={setMaxP} keyboardType="number-pad" placeholder="50" />
          {!!policy.lockedFields.maxParticipants && (
            <Text style={styles.fieldNote}>{policy.lockedFields.maxParticipants}</Text>
          )}
          <Field label="Contact Number" value={contactNumber} onChangeText={handleContactNumberChange} keyboardType="phone-pad" placeholder="0917 123 4567" maxLength={13} />
          <Field label="Contact Email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" placeholder="event@rotaract.org" />

          {/* District events are always open to every verified member and invite
              the whole district — visibility/approval/invite controls are hidden,
              consistent with the create form. */}
          {type === 'DISTRICT_EVENT' ? (
            <View style={styles.districtInfoRow}>
              <Ionicons name="globe-outline" size={15} color={colors.textMuted} />
              <Text style={styles.districtInfoText}>
                Open to all verified members. This district event invites everyone in the district.
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
              {policy.lockedFields.requiresApproval ? (
                <View style={styles.fieldLockCard}>
                  <View style={styles.fieldLockHeader}>
                    <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                    <Text style={styles.fieldLockTitle}>
                      Join approval: {event.requires_approval ? 'required' : 'not required'}
                    </Text>
                  </View>
                  <Text style={styles.fieldLockText}>{policy.lockedFields.requiresApproval}</Text>
                </View>
              ) : (
                <Toggle label="Requires organizer approval to join" value={requiresApproval} onChange={setRequiresApproval} />
              )}
              <Toggle label="Participants can invite others" value={allowInvites} onChange={setAllowInvites} />
            </>
          )}
          <TouchableOpacity style={styles.submitBtn} onPress={handleSave}>
            <Ionicons name="save" size={20} color="#fff" />
            <Text style={styles.submitText}>Save Changes</Text>
          </TouchableOpacity>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

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

function Field({ label, ...rest }: any) {
  const { colors: themeColors } = useTheme();
  const [focused, setFocused] = useState(false);
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

  lockedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  lockedIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  lockedTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  lockedReason: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  lockedBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginTop: 8 },
  lockedBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  policyBanner: { backgroundColor: '#FFFDF0', borderWidth: 1, borderColor: '#FFE866', borderRadius: 14, padding: 14, marginBottom: 8, gap: 6 },
  policyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  policyTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  policyNote: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  fieldLockCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginTop: 12, gap: 4 },
  fieldLockHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLockTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  fieldLockText: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  fieldLockValue: { fontSize: 13, color: colors.text, marginTop: 2 },
  fieldNote: { fontSize: 11, color: colors.textMuted, marginTop: 4, lineHeight: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 15, backgroundColor: colors.surface, color: colors.text },
  inputFocused: { borderWidth: 1.5, borderColor: colors.primary },
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
  typeRow: { flexDirection: 'row', gap: 10 },
  typeCard: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 },
  typeCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeText: { fontSize: 13, fontWeight: '700', color: colors.text },
  typeTextActive: { color: '#fff' },
  visRow: { flexDirection: 'row', gap: 8 },
  districtInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  districtInfoText: { fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 16 },
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
});
