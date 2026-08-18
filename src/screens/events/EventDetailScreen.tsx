import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Image, Modal, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { StatusBadge } from '../../components/StatusBadge';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { canMessageUser, inquiryBlockedMessage } from '../../utils/messaging';
import { Club } from '../../types';
import { DeclineReasonModal } from '../../components/DeclineReasonModal';
import { ConfirmRulesModal } from '../../components/ConfirmRulesModal';
import { UserProfileModal } from '../../components/UserProfileModal';
import UserAvatar from '../../components/UserAvatar';
import VerifiedCheck from '../../components/VerifiedCheck';
import { BottomSheet } from '../../components/BottomSheet';
import { callNumber, sendEmail, openMaps } from '../../utils/contactLinks';
import { AppUser } from '../../types';
import { areaOfFocusIcon, areaOfFocusLabel } from '../../data/areasOfFocus';
import { formatTime, formatDate } from '../../utils/timeFormat';

import * as Location from 'expo-location';
import { checkInWindow, distanceMeters, formatDistance, CHECK_IN_RADIUS_M } from '../../utils/checkIn';
import { eventEditPolicy, editLockRulesForApproval } from '../../utils/eventEditPolicy';
import {
  approverClubIdsFor,
  pendingApproverClubIdsFor,
  canApproveEvent,
  canViewEvent,
  isOnOrganizingTeam,
} from '../../utils/eventApproval';

type Props = NativeStackScreenProps<RootStackParamList, 'EventDetail'>;

export default function EventDetailScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  // The action footer below is a sibling of the SafeAreaView's scroll content, not
  // a child laid out inside its padding — so SafeAreaView's own edges={['bottom']}
  // padding never reaches it. Read the inset directly and pad the footer with it,
  // so its buttons clear the Android gesture/nav bar instead of sitting under it.
  const insets = useSafeAreaInsets();
  const { events, clubs, users, notifications, participantsFor, participationFor, joinEvent, leaveEvent, checkIn, impactFor, approveEvent, rejectEvent, cancelEvent, sendMessageToOrganizer, getOrCreateConversation, getOrCreateEventGroupConversation, canAccessEventGroupChat, approveParticipant, declineParticipant, invitationFor, respondInvitation } = useData();

  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [optionsSheetVisible, setOptionsSheetVisible] = useState(false);
  const [inviteDeclineVisible, setInviteDeclineVisible] = useState(false);
  const [declineTarget, setDeclineTarget] = useState<{ participantId: string; applicantName?: string } | null>(null);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  // Refusal notice, shown instead of letting the write fail into the sync banner.
  const [blockedName, setBlockedName] = useState<string | null>(null);
  const [approvalConfirmVisible, setApprovalConfirmVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const event = events.find(e => e.id === eventId);
  if (!event) return <Text style={{ padding: 20 }}>Event not found.</Text>;

  const allParticipants = participantsFor(eventId);

  // Pending and cancelled events are restricted to the organizing team, approving Presidents,
  // admins, and registered participants — deep links and stale navigation must not leak them either.
  if (!canViewEvent(event, user, users, allParticipants)) {
    return <Text style={{ padding: 20 }}>This event is not available.</Text>;
  }

  const organizingClub = clubs.find((c: Club) => c.id === event.organizing_club_id);
  const partnerClubs = clubs.filter((c: Club) => event.participating_club_ids.includes(c.id));
  const start = new Date(event.start_datetime);
  const end = new Date(event.end_datetime);

  const joinedParticipantsCount = allParticipants.filter(p => p.status === 'JOINED').length;
  const pendingParticipants = allParticipants.filter(p => p.status === 'PENDING');
  const userParticipation = user ? participationFor(eventId, user.id) : undefined;
  const impact = impactFor(eventId);

  const isDistrictAdmin = user?.role === 'DISTRICT_ADMIN' || user?.role === 'APP_ADMIN';
  const isDistrictEvent = event.event_type === 'DISTRICT_EVENT';
  const isClubPresident = user?.role === 'CLUB_PRESIDENT' && user?.club_id === event.organizing_club_id;
  const canApprove = canApproveEvent(event, user, users);
  const isOrganizer = isOnOrganizingTeam(event, user) || isClubPresident || isDistrictAdmin;

  const approverClubIds = approverClubIdsFor(event, users);
  const awaitingClubIds = pendingApproverClubIdsFor(event, users);
  const approvedClubIds = approverClubIds.filter(id => !awaitingClubIds.includes(id));
  const isMultiClubApproval = approverClubIds.length > 1;
  const alreadyApprovedByMyClub =
    user?.role === 'CLUB_PRESIDENT' && approvedClubIds.includes(user.club_id);
  const clubNameFor = (id: string) => clubs.find((c: Club) => c.id === id)?.club_name ?? 'Club';

  const creator = users.find(u => u.id === event.organizer_user_id);

  const editPolicy = eventEditPolicy(event, user, users, allParticipants);

  /**
   * The team grouped by club: each involved club, its role on the event, and the
   * members from that club running it. The organizing club leads, then clubs brought
   * in by co-organizers, then partner clubs with nobody on the team.
   */
  const teamByClub = (() => {
    const coOrganizers = (event.co_organizer_user_ids ?? [])
      .map(id => users.find(u => u.id === id))
      .filter((u): u is AppUser => !!u);

    const rows: { club: Club; role: string; members: { user: AppUser; isCreator: boolean }[] }[] = [];
    const addClub = (id: string, role: string) => {
      const club = clubs.find((c: Club) => c.id === id);
      if (!club || rows.some(r => r.club.id === club.id)) return;
      rows.push({ club, role, members: [] });
    };

    addClub(event.organizing_club_id, 'Organizer');
    coOrganizers.forEach(u => addClub(u.club_id, 'Co-organizer'));
    event.participating_club_ids.forEach(id => addClub(id, 'Partner'));

    const addMember = (u: AppUser | undefined, isCreator: boolean) => {
      if (!u) return;
      const row = rows.find(r => r.club.id === u.club_id);
      if (row && !row.members.some(m => m.user.id === u.id)) row.members.push({ user: u, isCreator });
    };
    addMember(creator, true);
    coOrganizers.forEach(u => addMember(u, false));

    // Populate partner club rows with their JOINED participants
    const joinedUserIds = allParticipants.filter(p => p.status === 'JOINED').map(p => p.user_id);
    for (const row of rows) {
      if (row.role !== 'Partner') continue;
      const clubMembers = users.filter(u => u.club_id === row.club.id && joinedUserIds.includes(u.id));
      clubMembers.forEach(u => addMember(u, false));
    }

    // Remove partner clubs that still have no members
    return rows.filter(r => r.role !== 'Partner' || r.members.length > 0);
  })();
  const isJoined = userParticipation?.status === 'JOINED';
  const isPending = userParticipation?.status === 'PENDING';

  // Set when the user arrived here from a "You were invited" notification or message —
  // they can respond without going back to the inbox.
  const pendingInvitation = user ? invitationFor(eventId, user.id) : undefined;
  const inviter = pendingInvitation ? users.find(u => u.id === pendingInvitation.invited_by_user_id) : undefined;

  const handleAcceptInvitation = () => {
    if (!user || !pendingInvitation) return;
    respondInvitation(pendingInvitation.id, true, user);
    Alert.alert('Invitation Accepted', `You have joined ${event.title}.`);
  };

  const handleDeclineInvitation = (reason: string) => {
    if (!user || !pendingInvitation) return;
    respondInvitation(pendingInvitation.id, false, user, reason);
    setInviteDeclineVisible(false);
    Alert.alert(
      'Invitation Declined',
      reason
        ? `You declined the invitation to ${event.title}. Your reason was sent to ${inviter?.full_name ?? 'the inviter'}.`
        : `You declined the invitation to ${event.title}.`,
    );
  };

  const handleApprove = () => {
    if (!user) return;
    const result = approveEvent(eventId, user);
    if (result.published) {
      Alert.alert('Event Approved!', 'The event is now active and visible to all members.');
    } else {
      Alert.alert(
        'Approval Recorded',
        `Your approval is in. This event still needs ${result.remainingApprovals} more club ${result.remainingApprovals === 1 ? 'President' : 'Presidents'} before it publishes.`,
      );
    }
  };

  const handleReject = () => {
    if (!user) return;
    setRejectModalVisible(true);
  };

  const handleConfirmCancelEvent = () => {
    setCancelModalVisible(true);
  };

  /**
   * Organizer menu shown in the "..." sheet. Rendered as an in-app card rather than a
   * native alert so it looks the same on every platform. Dismissing the sheet is the
   * cancel action, so there is no cancel row.
   */
  const optionsMenuItems: {
    label: string;
    sub: string;
    icon: keyof typeof Ionicons.glyphMap;
    destructive?: boolean;
    disabledReason?: string;
    run: () => void;
  }[] = [];

  // Kept visible even when disabled so the reason is explained rather than the
  // option silently vanishing.
  optionsMenuItems.push({
    label: 'Edit Event',
    sub: editPolicy.canEdit
      ? 'Update the venue, team, or details.'
      : (editPolicy.blockedReason ?? 'Editing is disabled for this event.'),
    icon: editPolicy.canEdit ? 'create-outline' : 'lock-closed-outline',
    disabledReason: editPolicy.canEdit ? undefined : editPolicy.blockedReason,
    run: () => navigation.navigate('EditEvent', { eventId }),
  });

  optionsMenuItems.push({
    label: 'Attendance',
    sub: 'Mark who showed up and verify check-ins.',
    icon: 'checkbox-outline',
    run: () => navigation.navigate('MarkAttendance', { eventId }),
  });

  // Banner announcements only make sense once an event is live and has participants.
  if (['PUBLISHED', 'RECRUITING', 'SCHEDULED', 'ONGOING'].includes(event.status)) {
    optionsMenuItems.push({
      label: 'Send Banner Notification',
      sub: 'Announce an update to participants (Normal / Alert / High priority).',
      icon: 'megaphone-outline',
      run: () => navigation.navigate('OrganizerBroadcast', { eventId }),
    });
  }

  // Impact can only be recorded once the event has actually happened — completing
  // early would release scoreboard points for an event that never ran.
  const eventHasEnded = Date.now() >= end.getTime();
  if (event.status !== 'COMPLETED' && event.status !== 'CANCELLED') {
    optionsMenuItems.push({
      label: 'Mark as Complete',
      sub: eventHasEnded
        ? 'Close the event and record its impact.'
        : 'Available once the event has ended.',
      icon: 'flag-outline',
      disabledReason: eventHasEnded
        ? undefined
        : 'You can record impact and complete the event only after its scheduled end time.',
      run: () => navigation.navigate('CompleteEvent', { eventId }),
    });
  }

  // Completed events are locked records (points already released) — they can no
  // longer be cancelled, matching the database update policy.
  if (event.status !== 'CANCELLED' && event.status !== 'COMPLETED') {
    optionsMenuItems.push({
      label: 'Cancel Event',
      sub: 'Mark this event as CANCELLED for everyone.',
      icon: 'close-circle-outline',
      destructive: true,
      run: () => handleConfirmCancelEvent(),
    });
  }

  const runOptionsMenuItem = (run: () => void) => {
    setOptionsSheetVisible(false);
    setTimeout(run, 300);
  };

  const cutoffHours = event.lock_leave_cutoff_hours ?? 24;
  const hoursUntilStart = (start.getTime() - Date.now()) / 3600000;
  const isLeaveLocked = isJoined && hoursUntilStart <= cutoffHours && event.status !== 'COMPLETED' && event.status !== 'CANCELLED';

  const windowState = checkInWindow(event);
  const isCheckInOpen = isJoined && windowState.state === 'OPEN';
  const hasCheckedIn = !!userParticipation?.checked_in_at || userParticipation?.attendance_status === 'ATTENDED';

  const handleCheckIn = async () => {
    if (!user) return;
    // A completed/cancelled event is a locked record — no further check-ins.
    if (event.status === 'COMPLETED' || event.status === 'CANCELLED') return;

    // Unverified members cannot check-in directly. Treat check-in attempt as join request.
    if (user.verification_status !== 'VERIFIED') {
      if (!isJoined && !isPending) {
        Alert.alert(
          'Verification Required for Check-In',
          'Unverified members cannot check in directly. Tapping check-in will submit a join request for organizer review.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Submit Join Request',
              onPress: () => handleLeaveOrJoinEvent(),
            },
          ],
        );
        return;
      }

      Alert.alert(
        'Check-In Restricted for Unverified Members',
        'Unverified members cannot check in to events until club membership verification is approved.',
      );
      return;
    }

    if (!userParticipation) return;
    if (hasCheckedIn) {
      const checkInTime = userParticipation.checked_in_at
        ? formatTime(userParticipation.checked_in_at)
        : 'Verified';
      Alert.alert('Attendance Verified', `You checked in at ${checkInTime}. Thank you for volunteering!`);
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is required to confirm your attendance at the venue premise.');
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const meters = distanceMeters(pos.coords, { latitude: event.latitude, longitude: event.longitude });
      const isWithinPremise = meters <= CHECK_IN_RADIUS_M;

      const now = new Date();
      const win = checkInWindow(event, now);
      const isScheduleValid = win.state === 'OPEN';
      const openTimeStr = formatTime(win.opensAt);

      // 1. Within premise, but schedule is not 30 minutes before event start -> Show schedule error only
      if (isWithinPremise && !isScheduleValid) {
        Alert.alert(
          'Check-In Schedule Error',
          `You are at the venue premise, but check-in only opens 30 minutes before the event starts (at ${openTimeStr}).`,
        );
        return;
      }

      // 2. Schedule is not 30 minutes before start AND not within premise -> Show schedule & premise error
      if (!isScheduleValid && !isWithinPremise) {
        Alert.alert(
          'Check-In Schedule & Premise Error',
          `Check-in is not open yet (opens 30 minutes before event start at ${openTimeStr}). Additionally, you are currently ${formatDistance(meters)} away from the venue premise.`,
        );
        return;
      }

      // 3. Schedule is valid, but not within venue premise -> Show premise error
      if (isScheduleValid && !isWithinPremise) {
        Alert.alert(
          'Check-In Premise Error',
          `Check-in is open, but you are currently ${formatDistance(meters)} away from ${event.address}. Please move within ${CHECK_IN_RADIUS_M}m of the venue premise to check in.`,
        );
        return;
      }

      // 4. Valid schedule & within premise -> Checked-in successfully
      checkIn(userParticipation.id, {
        checkedInAt: new Date().toISOString(),
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        distanceMeters: meters,
      });
      Alert.alert('Checked In Successfully!', `Welcome to ${event.title}! Your location premise and schedule have been verified on-site.`);
    } catch {
      Alert.alert('Check-In Error', 'Unable to acquire GPS location. Please check your device location services.');
    }
  };

  const handleLeaveOrJoinEvent = () => {
    if (!user) return;
    // Joining/leaving a finished event is not allowed.
    if (event.status === 'COMPLETED' || event.status === 'CANCELLED') return;

    if (isLeaveLocked) {
      Alert.alert(
        'Leave Policy Locked',
        `You cannot leave "${event.title}" within ${cutoffHours} hours of the event start time.\n\nPlease contact the event organizer directly if you have an emergency.`,
        [
          { text: 'OK', style: 'cancel' },
          {
            text: 'Message Organizer',
            onPress: () => {
              const conv = getOrCreateConversation(
                eventId,
                user,
                event.organizer_user_id,
                organizingClub?.club_name ?? event.organizing_club_name,
                event.title,
              );
              navigation.navigate('Chat', {
                conversationId: conv.id,
                eventId: event.id,
                recipientId: event.organizer_user_id,
                recipientName: organizingClub?.club_name ?? event.organizing_club_name,
                eventTitle: event.title,
              });
            },
          },
        ],
      );
      return;
    }

    if (isJoined || isPending) {
      Alert.alert(
        isJoined ? 'Leave Event' : 'Cancel Join Request',
        isJoined
          ? `Are you sure you want to leave "${event.title}"? You will lose access to the event group chat and free up your reserved spot.`
          : `Are you sure you want to cancel your join request for "${event.title}"?`,
        [
          { text: 'Keep My Spot', style: 'cancel' },
          {
            text: isJoined ? 'Leave Event' : 'Cancel Request',
            style: 'destructive',
            onPress: () => {
              leaveEvent(eventId, user.id);
              Alert.alert('Updated', `You have left ${event.title}.`);
            },
          },
        ],
      );
    } else {
      // 1. Participant capacity limit reached
      if (joinedParticipantsCount >= event.max_participants) {
        Alert.alert(
          'Participant Capacity Limit Reached',
          `This event has reached its maximum capacity of ${event.max_participants} participants.`,
        );
        return;
      }

      // 2. Club membership verification needed
      if (
        (event.visibility === 'VERIFIED_ROTARACTORS' || event.visibility === 'CLUB_ONLY') &&
        user.verification_status !== 'VERIFIED'
      ) {
        Alert.alert(
          'Club Membership Verification Needed',
          'Verification is required to join this event. Please complete your club membership verification first.',
        );
        return;
      }

      // 3. Pre-requisite for this event not met
      if (event.visibility === 'CLUB_ONLY' && user.club_id !== event.organizing_club_id) {
        Alert.alert(
          'Pre-requisite Not Met',
          `This event is restricted exclusively to members of ${organizingClub?.club_name ?? event.organizing_club_name}.`,
        );
        return;
      }

      // 3b. Invitation-only events can only be joined by responding to an invitation.
      if (event.visibility === 'INVITATION_ONLY' && !pendingInvitation) {
        Alert.alert(
          'Invitation Only',
          'This event is only open to invited Rotaractors. Ask the organizer or a participant to send you an invitation.',
        );
        return;
      }

      // 4. Event schedule conflict (if user joined other event and might overlap)
      const targetStart = new Date(event.start_datetime).getTime();
      const targetEnd = new Date(event.end_datetime).getTime();

      const userEvents = events.filter(e => {
        if (e.id === event.id) return false;
        const part = participationFor(e.id, user.id);
        return part?.status === 'JOINED' || part?.status === 'PENDING';
      });

      const conflictingEvent = userEvents.find(e => {
        const eStart = new Date(e.start_datetime).getTime();
        const eEnd = new Date(e.end_datetime).getTime();
        return targetStart < eEnd && targetEnd > eStart;
      });

      if (conflictingEvent) {
        const conflictDateStr = formatDate(conflictingEvent.start_datetime, { short: true });
        const conflictTimeRange = `${formatTime(conflictingEvent.start_datetime)} - ${formatTime(conflictingEvent.end_datetime)}`;
        Alert.alert(
          'Event Schedule Conflict',
          `You have an event schedule conflict with "${conflictingEvent.title}" (${conflictDateStr}, ${conflictTimeRange}).`,
        );
        return;
      }

      const isSameClub = user.club_id === event.organizing_club_id;
      const needsApproval = event.requires_approval && !isSameClub;

      Alert.alert(
        needsApproval ? 'Request to Join' : 'Join Event',
        needsApproval
          ? `Submit a join request for "${event.title}"? The organizer will review your request.`
          : `Are you sure you want to join "${event.title}"? You will be added to the participant roster immediately.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: needsApproval ? 'Submit Request' : 'Confirm Join',
            onPress: () => {
              joinEvent(eventId, user.id);
              if (needsApproval) {
                Alert.alert('Request Sent', 'Your join request was sent to the event organizer.');
              } else {
                Alert.alert('Joined!', `You joined ${event.title}.`);
              }
            },
          },
        ],
      );
    }
  };

  const handleToggleJoin = async () => {
    if (!user) return;
    if (isJoined && !hasCheckedIn) {
      handleCheckIn();
      return;
    }
    if (isLeaveLocked) {
      handleLeaveOrJoinEvent();
      return;
    }
    handleLeaveOrJoinEvent();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {event.cover_photo ? (
          <View style={styles.coverImageWrap}>
            <Image source={{ uri: event.cover_photo }} style={styles.coverImage} resizeMode="cover" />
            <View style={styles.coverOverlay}>
              {event.event_type === 'SERVICE_PROJECT' ? (
                <FontAwesome5 name="hands-helping" size={16} color="#fff" />
              ) : event.event_type === 'DISTRICT_EVENT' ? (
                <Ionicons name="ribbon" size={18} color="#fff" />
              ) : (
                <Ionicons name="people" size={18} color="#fff" />
              )}
              <Text style={styles.coverType}>{event.event_type.replace(/_/g, ' ')}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.cover}>
            {event.event_type === 'SERVICE_PROJECT' ? (
              <FontAwesome5 name="hands-helping" size={42} color="#fff" />
            ) : event.event_type === 'DISTRICT_EVENT' ? (
              <Ionicons name="ribbon" size={48} color="#fff" />
            ) : (
              <Ionicons name="people" size={48} color="#fff" />
            )}
            <Text style={styles.coverType}>{event.event_type.replace(/_/g, ' ')}</Text>
          </View>
        )}

        <View style={styles.body}>
          {event.status === 'CANCELLED' && (
            <View style={styles.cancelledBanner}>
              <View style={styles.cancelledHeader}>
                <Ionicons name="close-circle" size={20} color={colors.danger} />
                <Text style={styles.cancelledTitle}>Event Cancelled</Text>
              </View>
              <Text style={styles.cancelledSub}>
                {(() => {
                  if (event.cancellation_reason?.trim()) {
                    return `Reason: ${event.cancellation_reason.trim()}`;
                  }
                  // Fall back only to this user's own notifications — `notifications`
                  // from the context is the district-wide list, so filtering by
                  // recipient keeps one member's message out of another's banner.
                  const own = user
                    ? notifications.find(
                        n =>
                          n.user_id === user.id &&
                          n.event_id === event.id &&
                          typeof n.message === 'string' &&
                          n.message.includes('Reason: '),
                      )
                    : undefined;
                  if (own?.message) {
                    return `Reason: ${own.message.split('Reason: ')[1].trim()}`;
                  }
                  return 'This event was cancelled by the organizers.';
                })()}
              </Text>
            </View>
          )}

          {event.status === 'COMPLETED' && (
            <View style={styles.completedPointsBanner}>
              <View style={styles.completedPointsHeader}>
                <Ionicons name="trophy" size={20} color="#B45309" />
                <Text style={styles.completedPointsTitle}>Event Completed & Scoreboard Points Released!</Text>
              </View>
              <Text style={styles.completedPointsSub}>
                {event.event_type === 'DISTRICT_EVENT'
                  ? '🏆 District Event: +500 PTS awarded to organizers, +200 PTS to attendees (+20 PTS/hr). Event details are locked.'
                  : '🎉 Standard Event: +100 PTS awarded to organizers, +50 PTS to attendees (+10 PTS/hr). Event details are locked.'}
              </Text>
            </View>
          )}

          {pendingInvitation && (
            <View style={styles.inviteBanner}>
              <View style={styles.approvalBannerHeader}>
                <Ionicons name="mail-open" size={22} color={colors.primary} />
                <Text style={styles.inviteTitle}>You're Invited</Text>
              </View>
              <Text style={styles.approvalSub}>
                {inviter ? `${inviter.full_name} invited you to this event.` : 'You were invited to this event.'} Respond below to confirm your slot.
              </Text>
              <View style={styles.approvalActions}>
                <TouchableOpacity style={styles.approveBtn} onPress={handleAcceptInvitation}>
                  <Ionicons name="checkmark-circle" size={16} color="#fff" />
                  <Text style={styles.approveBtnText}>Accept Invitation</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.declineBtn} onPress={() => setInviteDeclineVisible(true)}>
                  <Ionicons name="close-circle" size={16} color={colors.danger} />
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {event.status === 'PENDING_APPROVAL' && (
            <View style={styles.approvalBanner}>
              <View style={styles.approvalBannerHeader}>
                <Ionicons name="time" size={22} color={colors.warning} />
                <Text style={styles.approvalTitle}>
                  {isDistrictEvent
                    ? (canApprove ? 'District Admin Approval Needed' : 'Awaiting District Admin Approval')
                    : (canApprove ? 'Club President Approval Needed' : 'Awaiting Club President Approval')}
                </Text>
              </View>
              <Text style={styles.approvalSub}>
                {isDistrictEvent
                  ? (canApprove
                      ? 'A Rotaractor submitted this District Event. Review and approve to publish across District 3800.'
                      : 'This District Event was submitted to the District Administrator for review before being published.')
                  : isMultiClubApproval
                    ? `This event involves ${approverClubIds.length} clubs. Every club President must approve before it is published — ${approvedClubIds.length} of ${approverClubIds.length} so far.`
                    : (canApprove
                        ? 'A member submitted this event. Review and approve to publish it for all members.'
                        : 'This event has been submitted to your Club President for review before being published.')}
              </Text>

              {!isDistrictEvent && isMultiClubApproval && (
                <View style={styles.approverList}>
                  {approverClubIds.map(id => {
                    const approved = approvedClubIds.includes(id);
                    return (
                      <View key={id} style={styles.approverRow}>
                        <Ionicons
                          name={approved ? 'checkmark-circle' : 'ellipse-outline'}
                          size={16}
                          color={approved ? colors.success : themeColors.textMuted}
                        />
                        <Text style={[styles.approverName, { color: themeColors.text }, approved && [styles.approverNameDone, { color: themeColors.textMuted }]]}>
                          {clubNameFor(id)}
                        </Text>
                        <Text style={[styles.approverState, { color: themeColors.textMuted }]}>{approved ? 'Approved' : 'Awaiting'}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {alreadyApprovedByMyClub && !canApprove && (
                <Text style={[styles.approvalSub, { color: themeColors.textMuted }]}>
                  You have already approved on behalf of {clubNameFor(user!.club_id)}.
                </Text>
              )}

              {canApprove && (
                <View style={styles.approvalActions}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => setApprovalConfirmVisible(true)}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.approveBtnText}>Approve Event</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.declineBtn} onPress={handleReject}>
                    <Ionicons name="close-circle" size={16} color={colors.danger} />
                    <Text style={styles.declineBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {isOrganizer && pendingParticipants.length > 0 && (
            <View style={[styles.pendingReviewBanner, { backgroundColor: isNightMode ? themeColors.cardBg : '#FFFBEB', borderColor: isNightMode ? themeColors.border : '#FCD34D' }]}>
              <View style={styles.pendingReviewHeader}>
                <Ionicons name="person-add" size={20} color={isNightMode ? themeColors.warning : '#B45309'} />
                <Text style={[styles.pendingReviewTitle, { color: isNightMode ? themeColors.warning : '#B45309' }]}>
                  {pendingParticipants.length} Pending Join {pendingParticipants.length === 1 ? 'Request' : 'Requests'}
                </Text>
              </View>
              <Text style={[styles.pendingReviewSub, { color: themeColors.textMuted }]}>
                Review applicant profiles below and approve them for this event.
              </Text>
              <View style={styles.pendingCardList}>
                {pendingParticipants.map(p => {
                  const u = users.find(x => x.id === p.user_id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.pendingUserCard, { backgroundColor: isNightMode ? themeColors.surface : '#fff', borderColor: isNightMode ? themeColors.border : '#FDE68A' }]}
                      onPress={() => u && setSelectedUser(u)}
                      activeOpacity={0.8}
                    >
                      <View style={[styles.pendingUserAvatar, { backgroundColor: themeColors.primary }]}>
                        <Text style={styles.pendingAvatarText}>
                          {u?.full_name.split(' ').map(x => x[0]).slice(0, 2).join('') || '?'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pendingUserName, { color: themeColors.text }]}>{u?.full_name || 'Member'}</Text>
                        <Text style={[styles.pendingUserMeta, { color: themeColors.textMuted }]}>{u?.club_name} • {u?.position}</Text>
                      </View>
                      {user && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity style={styles.inlineApproveBtn} onPress={() => approveParticipant(p.id, user)}>
                            <Ionicons name="checkmark-circle" size={14} color="#fff" />
                            <Text style={styles.inlineApproveText}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.inlineDeclineBtn} onPress={() => setDeclineTarget({ participantId: p.id, applicantName: u?.full_name })}>
                            <Ionicons name="close-circle" size={14} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              <StatusBadge status={event.status} />
              {event.visibility === 'VERIFIED_ROTARACTORS' && (
                <View style={styles.visPill}>
                  <Ionicons name="shield-checkmark" size={11} color={colors.success} />
                  <Text style={styles.visText}>Verified only</Text>
                </View>
              )}
            </View>

            {isOrganizer && (
              <TouchableOpacity
                style={[styles.headerIconBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                onPress={() => setOptionsSheetVisible(true)}
                accessibilityLabel="More Options"
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={themeColors.text} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.title, { color: themeColors.text }]}>{event.title}</Text>
          <Text style={[styles.desc, { color: themeColors.textMuted }]}>{event.description}</Text>

          {event.areas_of_focus && event.areas_of_focus.length > 0 && (
            <View style={styles.aofWrap}>
              {event.areas_of_focus.map(area => (
                <View key={area} style={[styles.aofChip, { backgroundColor: themeColors.primary + '18', borderColor: themeColors.primary + '40' }]}>
                  <Ionicons name={areaOfFocusIcon(area)} size={13} color={themeColors.primary} />
                  <Text style={[styles.aofText, { color: themeColors.primary }]}>{areaOfFocusLabel(area)}</Text>
                </View>
              ))}
            </View>
          )}

          {impact && (
            <View style={[styles.impactCard, { backgroundColor: isNightMode ? themeColors.cardBg : '#FDF2F7', borderColor: isNightMode ? themeColors.border : '#F9D6E5' }]}>
              <View style={styles.impactHeader}>
                <Ionicons name="ribbon" size={18} color={themeColors.primary} />
                <Text style={[styles.impactTitle, { color: themeColors.primary }]}>Recorded Event Impact</Text>
              </View>
              <View style={styles.impactGrid}>
                <View style={styles.impactItem}>
                  <Text style={[styles.impactVal, { color: themeColors.text }]}>{impact.volunteer_hours}</Text>
                  <Text style={[styles.impactLbl, { color: themeColors.textMuted }]}>Volunteer Hrs</Text>
                </View>
                <View style={styles.impactItem}>
                  <Text style={[styles.impactVal, { color: themeColors.text }]}>{impact.beneficiaries}</Text>
                  <Text style={[styles.impactLbl, { color: themeColors.textMuted }]}>Beneficiaries</Text>
                </View>
                {impact.funds_raised > 0 && (
                  <View style={styles.impactItem}>
                    <Text style={[styles.impactVal, { color: themeColors.text }]}>₱{impact.funds_raised.toLocaleString()}</Text>
                    <Text style={[styles.impactLbl, { color: themeColors.textMuted }]}>Funds Raised</Text>
                  </View>
                )}
              </View>
              {impact.impact_summary ? <Text style={[styles.impactSummary, { color: themeColors.text }]}>“{impact.impact_summary}”</Text> : null}
            </View>
          )}

          <Section title="When">
            <InfoRow icon="calendar-outline" text={formatDate(start)} />
            <InfoRow
              icon="time-outline"
              text={`${formatTime(start)} — ${formatTime(end)}`}
            />
          </Section>

          <Section title="Where">
            <InfoRow
              icon="location-outline"
              text={event.address}
              onPress={() => openMaps(event.latitude, event.longitude, event.address)}
              hideOpenIcon
            />
            <InfoRow icon="business-outline" text={event.city} />
          </Section>

          <Section title="Organizer & Team Members">
            {teamByClub.map(({ club, role, members }) => (
              <View key={club.id} style={styles.teamClubBlock}>
                <TouchableOpacity
                  style={styles.infoRow}
                  onPress={() => navigation.navigate('ClubDetail', { clubId: club.id })}
                >
                  <Ionicons name="business-outline" size={16} color={themeColors.textMuted} />
                  <Text style={[styles.infoText, { color: themeColors.text }]} numberOfLines={1}>
                    {club.club_name} <Text style={[styles.teamRoleInline, { color: themeColors.textMuted }]}>· {role}</Text>
                  </Text>
                </TouchableOpacity>

                {members.map(({ user: member, isCreator }) => (
                  <TouchableOpacity
                    key={member.id}
                    style={styles.teamMemberRow}
                    onPress={() => setSelectedUser(member)}
                  >
                    <UserAvatar user={member} size={28} />
                    <Text style={[styles.teamMemberLine, { color: themeColors.text }]} numberOfLines={1}>
                      {member.full_name}
                      <Text style={[styles.teamMemberMeta, { color: themeColors.textMuted }]}> · {member.position}</Text>
                      {isCreator && <Text style={[styles.teamCreatorInline, { color: themeColors.primary }]}> · Creator</Text>}
                    </Text>
                    <VerifiedCheck user={member} size={13} />
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </Section>

          <Section title="Participation">
            <TouchableOpacity style={styles.partRow} onPress={() => navigation.navigate('Participants', { eventId })}>
              <View style={{ flex: 1 }}>
                <InfoRow icon="person-outline" text={`${joinedParticipantsCount} of ${event.max_participants} spots filled`} />
              </View>
              <View style={styles.viewLink}>
                <Text style={[styles.viewLinkText, { color: themeColors.primary }]}>View list</Text>
                <Ionicons name="chevron-forward" size={14} color={themeColors.primary} />
              </View>
            </TouchableOpacity>

            <View style={[styles.progressBar, { backgroundColor: isNightMode ? themeColors.surface : '#E2E8F0' }]}>
              <View style={[styles.progressFill, { backgroundColor: themeColors.primary, width: `${Math.min(100, (joinedParticipantsCount / event.max_participants) * 100)}%` }]} />
            </View>
          </Section>

          {/* Unified Communication & Community Section */}
          <Section title="Communication & Community">
            <View style={styles.commCardsWrap}>
              {/* Card 1: Event Group Chat */}
              {user && canAccessEventGroupChat(eventId, user.id) ? (
                <TouchableOpacity
                  style={[styles.commCard, { backgroundColor: isNightMode ? themeColors.cardBg : themeColors.primary + '12', borderColor: isNightMode ? themeColors.border : themeColors.primary }]}
                  onPress={() => {
                    const groupConv = getOrCreateEventGroupConversation(eventId);
                    navigation.navigate('Chat', {
                      conversationId: groupConv.id,
                      eventId: event.id,
                      recipientId: 'ALL_PARTICIPANTS',
                      recipientName: `${event.title} Group Chat`,
                      eventTitle: event.title,
                    });
                  }}
                >
                  <View style={[styles.commIconWrap, { backgroundColor: themeColors.primary }]}>
                    <Ionicons name="chatbubbles" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.commCardTitle, { color: themeColors.text }]}>Event Group Chat</Text>
                    <Text style={[styles.commCardSub, { color: themeColors.textMuted }]}>
                      {joinedParticipantsCount} confirmed attendees • Tap to chat
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={themeColors.primary} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.commCardDisabled, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
                  <View style={[styles.commIconWrap, { backgroundColor: themeColors.surface }]}>
                    <Ionicons name="lock-closed-outline" size={18} color={themeColors.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.commTitleDisabled, { color: themeColors.text }]}>Group Chat (Locked)</Text>
                    <Text style={[styles.commSubDisabled, { color: themeColors.textMuted }]}>
                      {isPending
                        ? 'Unlocks when your join request is approved.'
                        : 'Join & get approved to enter attendee group chat.'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Card 2: Message Organizer Direct Inquiry */}
              <TouchableOpacity
                style={[styles.commCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                onPress={() => {
                  if (user) {
                    const conv = getOrCreateConversation(eventId, user, event.organizer_user_id, organizingClub?.club_name ?? event.organizing_club_name, event.title);
                    navigation.navigate('Chat', {
                      conversationId: conv.id,
                      eventId: event.id,
                      recipientId: event.organizer_user_id,
                      recipientName: organizingClub?.club_name ?? event.organizing_club_name,
                      eventTitle: event.title,
                    });
                  }
                }}
              >
                <View style={[styles.commIconWrap, { backgroundColor: themeColors.surface }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={themeColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.commCardTitle, { color: themeColors.text }]}>Message Organizer</Text>
                  <Text style={[styles.commCardSub, { color: themeColors.textMuted }]}>
                    Direct 1-on-1 inquiry to {organizingClub?.club_name ?? event.organizing_club_name}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>
          </Section>

          <Section title="Access & Policies">
            <InfoRow
              icon={
                event.visibility === 'VERIFIED_ROTARACTORS'
                  ? 'shield-checkmark-outline'
                  : event.visibility === 'CLUB_ONLY'
                  ? 'people-circle-outline'
                  : 'lock-closed-outline'
              }
              text={
                event.visibility === 'VERIFIED_ROTARACTORS'
                  ? 'Verified Rotaractors Only'
                  : event.visibility === 'CLUB_ONLY'
                  ? 'Organizing Club Members Only'
                  : 'Invitation Only'
              }
            />
            <InfoRow
              icon={event.requires_approval ? 'shield-outline' : 'flash-outline'}
              text={event.requires_approval ? 'Requires Organizer Approval to Join' : 'Instant Join (No Approval Needed)'}
            />
            <InfoRow
              icon={event.allow_participant_invites ? 'person-add-outline' : 'person-remove-outline'}
              text={event.allow_participant_invites ? 'Participants Can Invite Others' : 'Organizer Invites Only'}
            />
            <InfoRow
              icon="time-outline"
              text={`Leave Lock Policy: Locked ${cutoffHours}h before start`}
            />
          </Section>

          {(event.contact_number || event.contact_email) && (
            <Section title="Contact & Inquiries">
              {event.contact_number ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${event.contact_number}`}
                  onPress={() => callNumber(event.contact_number)}
                >
                  <InfoRow icon="call-outline" text={`${event.contact_number}  (Tap to call)`} />
                </TouchableOpacity>
              ) : null}
              {event.contact_email ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Email ${event.contact_email}`}
                  onPress={() => sendEmail(event.contact_email, event.title)}
                >
                  <InfoRow icon="mail-outline" text={`${event.contact_email}  (Tap to email)`} />
                </TouchableOpacity>
              ) : null}
            </Section>
          )}
        </View>
      </ScrollView>

      {/* A cancelled or completed event is read-only: details stay visible to
          everyone, but joining, checking in and leaving are no longer meaningful. */}
      {event.status === 'CANCELLED' || event.status === 'COMPLETED' ? (
        <View style={[styles.footer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border, paddingBottom: 16 + insets.bottom }]}>
          <View style={[styles.cancelledFooterBtn, { backgroundColor: themeColors.surface }]}>
            <Ionicons name={event.status === 'COMPLETED' ? 'checkmark-done-circle' : 'close-circle'} size={18} color={themeColors.textMuted} />
            <Text style={[styles.cancelledFooterText, { color: themeColors.textMuted }]}>
              {event.status === 'COMPLETED' ? 'This event has been completed' : 'This event was cancelled'}
            </Text>
          </View>
        </View>
      ) : (
      <View style={[styles.footer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border, paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.actionBtnGroup}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { flex: 1, backgroundColor: themeColors.primary },
              hasCheckedIn && { backgroundColor: colors.success },
              isCheckInOpen && !hasCheckedIn && { backgroundColor: colors.success },
              isLeaveLocked && !isCheckInOpen && { backgroundColor: isNightMode ? '#334155' : '#475569' },
              !isLeaveLocked && !isCheckInOpen && isJoined && styles.joinedBtn,
              isPending && styles.pendingBtn,
            ]}
            onPress={handleToggleJoin}
          >
            <Ionicons
              name={
                hasCheckedIn
                  ? 'checkmark-circle'
                  : isCheckInOpen
                  ? 'location'
                  : isLeaveLocked
                  ? 'lock-closed'
                  : isJoined
                  ? 'checkmark-circle'
                  : isPending
                  ? 'time-outline'
                  : event.requires_approval
                  ? 'send'
                  : 'add-circle'
              }
              size={18}
              color="#fff"
            />
            <Text style={styles.primaryBtnText} numberOfLines={1}>
              {hasCheckedIn
                ? 'Checked In'
                : isCheckInOpen
                ? 'Check In'
                : isLeaveLocked
                ? 'Joined (Locked)'
                : isJoined
                ? 'Joined'
                : isPending
                ? 'Pending'
                : event.requires_approval
                ? 'Request Join'
                : 'Join'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.arrowUpBtn,
              { backgroundColor: themeColors.primary + 'E6' },
              hasCheckedIn && { backgroundColor: colors.success + 'CC' },
              isCheckInOpen && !hasCheckedIn && { backgroundColor: colors.success + 'CC' },
              isLeaveLocked && !isCheckInOpen && { backgroundColor: isNightMode ? '#1E293B' : '#334155' },
              !isLeaveLocked && !isCheckInOpen && isJoined && { backgroundColor: colors.success + 'CC' },
              isPending && { backgroundColor: colors.warning + 'CC' },
            ]}
            onPress={() => setActionModalVisible(true)}
          >
            <Ionicons name="chevron-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

          {/* Only the organizing team may invite when participant invites are disabled. */}
          {(isOnOrganizingTeam(event, user) || event.allow_participant_invites) && (
            <TouchableOpacity style={[styles.secondaryBtn, { borderColor: themeColors.primary }]} onPress={() => navigation.navigate('InvitePicker', { eventId })}>
              <Ionicons name="person-add-outline" size={18} color={themeColors.primary} />
              <Text style={[styles.secondaryBtnText, { color: themeColors.primary }]}>Invite</Text>
            </TouchableOpacity>
          )}
      </View>
      )}

      {/* Organizer "..." Options Sheet — closing the sheet is the cancel action. */}
      <BottomSheet visible={optionsSheetVisible} onClose={() => setOptionsSheetVisible(false)} cardStyle={[styles.actionSheetCard, { backgroundColor: themeColors.cardBg }]}>
        <View style={styles.actionSheetHandle} />

            <View style={styles.actionSheetHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.actionSheetTitle, { color: themeColors.text }]}>Event Options</Text>
                <Text style={[styles.actionSheetSub, { color: themeColors.textMuted }]} numberOfLines={1}>{event.title}</Text>
              </View>
              <TouchableOpacity style={[styles.closeSheetBtn, { backgroundColor: themeColors.surface }]} onPress={() => setOptionsSheetVisible(false)}>
                <Ionicons name="close" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.actionSheetList}>
              {optionsMenuItems.map(item => (
                <TouchableOpacity
                  key={item.label}
                  disabled={!!item.disabledReason}
                  style={[
                    styles.sheetActionItem,
                    { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
                    item.destructive && styles.sheetActionItemDanger,
                    !!item.disabledReason && [styles.sheetActionItemDisabled, { backgroundColor: themeColors.surface, borderColor: themeColors.border }],
                  ]}
                  onPress={() => runOptionsMenuItem(item.run)}
                >
                  <View
                    style={[
                      styles.sheetIconWrap,
                      { backgroundColor: (item.disabledReason ? themeColors.textMuted : item.destructive ? colors.danger : themeColors.primary) + '1A' },
                    ]}
                  >
                    <Ionicons
                      name={item.icon}
                      size={20}
                      color={item.disabledReason ? themeColors.textMuted : item.destructive ? colors.danger : themeColors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.sheetItemTitle,
                        { color: themeColors.text },
                        item.destructive && { color: colors.danger },
                        !!item.disabledReason && { color: themeColors.textMuted },
                      ]}
                    >
                      {item.label}{item.disabledReason ? ' (Disabled)' : ''}
                    </Text>
                    <Text style={[styles.sheetItemSub, { color: themeColors.textMuted }]}>{item.sub}</Text>
                  </View>
                  {!item.disabledReason && <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />}
                </TouchableOpacity>
              ))}
            </View>
      </BottomSheet>

      {/* Action Options Sheet Modal */}
      <BottomSheet visible={actionModalVisible} onClose={() => setActionModalVisible(false)} cardStyle={[styles.actionSheetCard, { backgroundColor: themeColors.cardBg }]}>
            <View style={styles.actionSheetHandle} />

            <View style={styles.actionSheetHeader}>
              <View>
                <Text style={[styles.actionSheetTitle, { color: themeColors.text }]}>Event Participation Actions</Text>
                <Text style={[styles.actionSheetSub, { color: themeColors.textMuted }]} numberOfLines={1}>{event.title}</Text>
              </View>
              <TouchableOpacity style={[styles.closeSheetBtn, { backgroundColor: themeColors.surface }]} onPress={() => setActionModalVisible(false)}>
                <Ionicons name="close" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.actionSheetList}>
              {/* Action 1: On-Site Check-In */}
              <TouchableOpacity
                style={[
                  styles.sheetActionItem,
                  { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
                  isCheckInOpen && styles.sheetActionItemActive,
                ]}
                onPress={() => {
                  setActionModalVisible(false);
                  setTimeout(() => handleCheckIn(), 300);
                }}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: hasCheckedIn || isCheckInOpen ? colors.success : themeColors.surface }]}>
                  <Ionicons name={hasCheckedIn ? 'checkmark-circle' : 'location'} size={20} color={hasCheckedIn || isCheckInOpen ? '#fff' : themeColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetItemTitle, { color: themeColors.text }]}>
                    {hasCheckedIn ? 'Checked-In ✓' : 'Check In On-Site (GPS Verified)'}
                  </Text>
                  <Text style={[styles.sheetItemSub, { color: themeColors.textMuted }]}>
                    {hasCheckedIn
                      ? 'Your attendance has been recorded on-site.'
                      : isCheckInOpen
                      ? `Ready! Move within ${CHECK_IN_RADIUS_M}m of venue to check in.`
                      : 'Check-in opens 30 minutes before event start.'}
                  </Text>
                </View>
                <View style={[styles.sheetStatusPill, hasCheckedIn || isCheckInOpen ? { backgroundColor: colors.success + '1A' } : { backgroundColor: themeColors.surface }]}>
                  <Text style={[styles.sheetStatusText, hasCheckedIn || isCheckInOpen ? { color: colors.success } : { color: themeColors.textMuted }]}>
                    {hasCheckedIn ? 'Verified' : isCheckInOpen ? 'Open Now' : 'Scheduled'}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Action 2: Join / Leave / Cancel Request */}
              <TouchableOpacity
                style={[styles.sheetActionItem, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                onPress={() => {
                  setActionModalVisible(false);
                  setTimeout(() => handleLeaveOrJoinEvent(), 300);
                }}
              >
                <View style={[styles.sheetIconWrap, { backgroundColor: isJoined ? (isLeaveLocked ? (isNightMode ? '#334155' : '#475569') : colors.danger + '1A') : themeColors.primary + '1A' }]}>
                  <Ionicons
                    name={isJoined ? (isLeaveLocked ? 'lock-closed' : 'log-out-outline') : isPending ? 'time-outline' : 'add-circle'}
                    size={20}
                    color={isJoined ? (isLeaveLocked ? '#fff' : colors.danger) : themeColors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetItemTitle, { color: themeColors.text }]}>
                    {isJoined
                      ? isLeaveLocked
                        ? `Leave Event (Locked)`
                        : 'Leave Event'
                      : isPending
                      ? 'Cancel Join Request'
                      : event.requires_approval
                      ? 'Request to Join'
                      : 'Join Event'}
                  </Text>
                  <Text style={[styles.sheetItemSub, { color: themeColors.textMuted }]}>
                    {isJoined
                      ? isLeaveLocked
                        ? `Locked within ${cutoffHours}h of event start time.`
                        : 'Remove yourself from the event roster.'
                      : isPending
                      ? 'Withdraw your submitted join application.'
                      : 'Register your participation for this event.'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
      </BottomSheet>

      <Modal visible={messageModalVisible} transparent animationType="fade" onRequestClose={() => setMessageModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalAvoidView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalBackdrop,
              {
                justifyContent: isKeyboardVisible ? 'flex-end' : 'center',
                paddingBottom: isKeyboardVisible ? 24 : 20,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={[styles.modalCard, { backgroundColor: themeColors.cardBg }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>Message Organizer</Text>
                <TouchableOpacity onPress={() => setMessageModalVisible(false)}>
                  <Ionicons name="close" size={22} color={themeColors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.modalSub, { color: themeColors.textMuted }]}>
                Send a direct inquiry regarding "{event.title}".
              </Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
                placeholder="Write your question or inquiry here..."
                placeholderTextColor={themeColors.textMuted}
                multiline
                numberOfLines={4}
                value={messageText}
                onChangeText={setMessageText}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setMessageModalVisible(false)}>
                  <Text style={[styles.cancelModalText, { color: themeColors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendModalBtn, { backgroundColor: themeColors.primary }, !messageText.trim() && styles.sendModalBtnDisabled]}
                  disabled={!messageText.trim()}
                  onPress={() => {
                    if (!messageText.trim() || !user) return;
                    // This path sends immediately, without going through ChatScreen,
                    // so it needs its own check — otherwise the write is rejected by
                    // RLS and the user only sees the generic sync banner.
                    const organizer = users.find(u => u.id === event.organizer_user_id);
                    if (!canMessageUser(organizer, user)) {
                      setMessageModalVisible(false);
                      setBlockedName(organizer?.full_name ?? 'This organizer');
                      return;
                    }
                    const conv = getOrCreateConversation(eventId, user, event.organizer_user_id, organizingClub?.club_name ?? event.organizing_club_name, event.title);
                    sendMessageToOrganizer(eventId, user, messageText.trim());
                    setMessageText('');
                    setMessageModalVisible(false);
                    navigation.navigate('Chat', {
                      conversationId: conv.id,
                      eventId: event.id,
                      recipientId: event.organizer_user_id,
                      recipientName: organizingClub?.club_name ?? event.organizing_club_name,
                      eventTitle: event.title,
                    });
                  }}
                >
                  <Ionicons name="send" size={14} color="#fff" />
                  <Text style={styles.sendModalText}>Send Message</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <DeclineReasonModal
        visible={!!declineTarget}
        applicantName={declineTarget?.applicantName}
        eventTitle={event.title}
        onConfirm={(reason) => {
          if (user && declineTarget) {
            declineParticipant(declineTarget.participantId, user, reason);
            setDeclineTarget(null);
            Alert.alert('Declined', 'Join request declined and reason sent to participant inbox.');
          }
        }}
        onCancel={() => setDeclineTarget(null)}
      />

      <DeclineReasonModal
        visible={inviteDeclineVisible}
        title="Decline Invitation"
        description={`Let ${inviter?.full_name ?? 'the organizer'} know why you can't join "${event.title}". This is optional.`}
        onConfirm={handleDeclineInvitation}
        onCancel={() => setInviteDeclineVisible(false)}
      />

      <UserProfileModal
        visible={!!selectedUser}
        targetUser={selectedUser}
        onClose={() => setSelectedUser(null)}
        eventContext={event ? { eventId: event.id, eventTitle: event.title } : undefined}
        onStartChat={(targetUser, aboutEvent) => {
          if (!user || !event) return;
          if (!canMessageUser(users.find(u => u.id === targetUser.id), user)) {
            setBlockedName(targetUser.full_name);
            return;
          }
          const ctxEventId = aboutEvent ? event.id : undefined;
          const conv = getOrCreateConversation(ctxEventId, user, targetUser.id, targetUser.full_name, aboutEvent ? event.title : undefined);
          navigation.navigate('Chat', {
            conversationId: conv.id,
            eventId: ctxEventId,
            recipientId: targetUser.id,
            recipientName: targetUser.full_name,
            eventTitle: aboutEvent ? event.title : undefined,
          });
        }}
      />

      <ConfirmRulesModal
        visible={approvalConfirmVisible}
        title="Approve This Event?"
        intro={`You are approving "${event.title}" on behalf of ${user?.club_name ?? 'your club'}. Review what this means.`}
        rules={editLockRulesForApproval(
          isDistrictEvent,
          awaitingClubIds.length <= 1,
        )}
        confirmLabel="Approve Event"
        confirmIcon="checkmark-circle"
        onConfirm={() => {
          setApprovalConfirmVisible(false);
          handleApprove();
        }}
        onCancel={() => setApprovalConfirmVisible(false)}
      />

      <DeclineReasonModal
        visible={cancelModalVisible}
        title="Cancel Event"
        description={`Provide a reason for cancelling "${event.title}". This reason will be sent to participants and displayed in the inbox.`}
        onConfirm={(reason) => {
          cancelEvent(eventId, reason, user || undefined);
          setCancelModalVisible(false);
          Alert.alert('Event Cancelled', 'The event status has been updated to CANCELLED and notifications were sent.');
        }}
        onCancel={() => setCancelModalVisible(false)}
      />

      <DeclineReasonModal
        visible={rejectModalVisible}
        title="Decline Event"
        description={`Optionally provide a reason for declining "${event.title}". This reason will be sent to the organizer.`}
        onConfirm={(reason) => {
          if (user) {
            rejectEvent(eventId, user, reason);
            setRejectModalVisible(false);
            Alert.alert('Event Declined', 'The event has been declined.');
          }
        }}
        onCancel={() => setRejectModalVisible(false)}
      />
          <ConfirmDialog
        visible={!!blockedName}
        title="Messaging unavailable"
        message={blockedName ? inquiryBlockedMessage(blockedName) : undefined}
        onClose={() => setBlockedName(null)}
        confirmLabel="OK"
      />
</SafeAreaView>
  );
}

function Section({ title, children }: any) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ icon, text, onPress, hideOpenIcon }: { icon: keyof typeof Ionicons.glyphMap; text: string; onPress?: () => void; hideOpenIcon?: boolean }) {
  const { colors: themeColors } = useTheme();
  if (onPress) {
    return (
      <TouchableOpacity style={styles.infoRow} onPress={onPress} activeOpacity={0.6}>
        <Ionicons name={icon} size={16} color={themeColors.primary} />
        <Text style={[styles.infoText, { color: themeColors.primary, flex: 1 }]}>{text}</Text>
        {!hideOpenIcon && <Ionicons name="open-outline" size={15} color={themeColors.primary} />}
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={themeColors.textMuted} />
      <Text style={[styles.infoText, { color: themeColors.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingBottom: 100 },
  cover: { height: 160, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  coverImageWrap: { height: 200, width: '100%', position: 'relative' },
  coverImage: { width: '100%', height: '100%' },
  coverOverlay: { position: 'absolute', bottom: 12, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  coverType: { color: '#fff', fontWeight: '800', marginTop: 0, letterSpacing: 1, fontSize: 12 },
  body: { padding: 20 },
  approvalBanner: { backgroundColor: '#FFFDF0', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FFE866', marginBottom: 16 },
  inviteBanner: { backgroundColor: colors.primary + '0D', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: colors.primary + '40', marginBottom: 16 },
  inviteTitle: { fontSize: 15, fontWeight: '800', color: colors.primary },
  approvalBannerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  approvalTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  approvalSub: { fontSize: 12, color: colors.textMuted, lineHeight: 16, marginTop: 2 },
  approverList: { marginTop: 10, gap: 6 },
  approverRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approverName: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.text },
  approverNameDone: { color: colors.textMuted },
  approverState: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  approvalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  approveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.success, paddingVertical: 10, borderRadius: 10 },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  declineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.danger },
  declineBtnText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  visPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: '#EBF9F3' },
  visText: { fontSize: 10, fontWeight: '700', color: colors.success },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 4 },
  desc: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginTop: 8 },
  aofWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  aofChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.primary + '14',
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  aofText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  cancelledBanner: { backgroundColor: '#FEE2E2', borderColor: '#EF4444', borderWidth: 1, padding: 14, borderRadius: 14, marginBottom: 16 },
  cancelledHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cancelledTitle: { fontSize: 14, fontWeight: '800', color: colors.danger },
  cancelledSub: { fontSize: 13, color: '#991B1B', fontWeight: '600' },
  completedPointsBanner: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, padding: 14, borderRadius: 14, marginBottom: 16 },
  completedPointsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  completedPointsTitle: { fontSize: 14, fontWeight: '800', color: '#78350F' },
  completedPointsSub: { fontSize: 12, color: '#92400E', fontWeight: '600' },
  coOrgDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.surface },
  teamClubBlock: { marginBottom: 6 },
  teamRoleInline: { color: colors.textMuted, fontWeight: '700' },
  teamMemberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  teamMemberLine: { flexShrink: 1, fontSize: 13, color: colors.text, fontWeight: '700' },
  teamMemberMeta: { fontWeight: '400', color: colors.textMuted },
  teamCreatorInline: { fontWeight: '700', color: colors.primary },
  coOrgDetailName: { fontSize: 13, fontWeight: '700', color: colors.text },
  coOrgDetailRole: { fontSize: 11, color: colors.textMuted, flex: 1, textAlign: 'right' },
  impactCard: { backgroundColor: '#FDF2F7', padding: 14, borderRadius: 14, marginTop: 16, borderWidth: 1, borderColor: '#F9D6E5' },
  impactHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  impactTitle: { fontSize: 13, fontWeight: '800', color: colors.primary },
  impactGrid: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 4 },
  impactItem: { alignItems: 'center' },
  impactVal: { fontSize: 18, fontWeight: '800', color: colors.text },
  impactLbl: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  impactSummary: { fontSize: 12, color: colors.text, fontStyle: 'italic', marginTop: 8 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 1, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  infoText: { fontSize: 14, color: colors.text },
  partRow: { flexDirection: 'row', alignItems: 'center' },
  viewLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewLinkText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  progressBar: { height: 6, backgroundColor: colors.surface, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  organizerSection: { marginTop: 24, padding: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  organizerBtns: { gap: 8, marginTop: 8 },
  orgBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  orgBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
  cancelledFooterBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 999, backgroundColor: colors.surface },
  cancelledFooterText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border },
  primaryBtn: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingHorizontal: 14, borderTopLeftRadius: 24, borderBottomLeftRadius: 24 },
  joinedBtn: { backgroundColor: colors.success },
  pendingBtn: { backgroundColor: colors.warning },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actionBtnGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 48 },
  arrowUpBtn: { height: 48, paddingHorizontal: 14, backgroundColor: colors.primary + 'CC', borderTopRightRadius: 24, borderBottomRightRadius: 24, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  secondaryBtn: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.primary, paddingHorizontal: 18, borderRadius: 24 },
  secondaryBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  msgOrgBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FDF2F7', borderWidth: 1, borderColor: '#F9D6E5', alignSelf: 'flex-start' },
  msgOrgBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  modalAvoidView: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalBackdrop: { flexGrow: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 20, paddingBottom: 24 },
  modalCard: { width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  modalSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
  modalInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 14, color: colors.text, backgroundColor: colors.surface, minHeight: 90, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  cancelModalBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelModalText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  sendModalBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  sendModalBtnDisabled: { backgroundColor: '#E4B0C6' },
  sendModalText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  commCardsWrap: { gap: 8, marginTop: 4 },
  commCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  commIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  commCardTitle: { fontSize: 13, fontWeight: '800' },
  commCardSub: { fontSize: 11, marginTop: 2 },
  commCardDisabled: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  commTitleDisabled: { fontSize: 13, fontWeight: '700' },
  commSubDisabled: { fontSize: 11, marginTop: 2 },

  // Action Sheet Modal
  actionSheetCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  actionSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 },
  actionSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  actionSheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  actionSheetSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  closeSheetBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  actionSheetList: { gap: 10 },
  sheetActionItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' },
  sheetActionItemActive: { borderColor: colors.success, backgroundColor: colors.success + '0A' },
  sheetActionItemDanger: { borderColor: colors.danger + '55', backgroundColor: colors.danger + '08' },
  sheetActionItemDisabled: { backgroundColor: colors.surface, borderColor: colors.border },
  sheetIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sheetItemTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  sheetItemSub: { fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 15 },
  sheetStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  sheetStatusText: { fontSize: 10, fontWeight: '800' },
  pendingReviewBanner: { backgroundColor: '#FFFBEB', borderRadius: 14, borderWidth: 1, borderColor: '#FCD34D', padding: 14, marginBottom: 14 },
  pendingReviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pendingReviewTitle: { fontSize: 15, fontWeight: '800', color: '#B45309' },
  pendingReviewSub: { fontSize: 12, color: '#92400E', marginTop: 2, marginBottom: 10 },
  pendingCardList: { gap: 8 },
  pendingUserCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A' },
  pendingUserAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  pendingAvatarText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  pendingUserName: { fontSize: 13, fontWeight: '700', color: colors.text },
  pendingUserMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  inlineApproveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  inlineApproveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  inlineDeclineBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
});
