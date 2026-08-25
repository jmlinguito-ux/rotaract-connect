import { Alert } from 'react-native';
import { AppNotification, AppUser, RotaractEvent, Conversation } from '../types';

export interface NotificationRouterContext {
  user: AppUser | null;
  events: RotaractEvent[];
  users: AppUser[];
  conversations: Conversation[];
  markNotificationRead?: (id: string) => void;
  dispatchLocalAlert?: (alert: any) => void;
}

export type AnyNavigator = {
  navigate: (...args: any[]) => void;
};

/**
 * Single source of truth for routing user taps on notifications
 * (in-app notifications list, inbox, and OS push notifications).
 */
export function handleAppNotificationNavigation(
  notification: AppNotification | Record<string, any>,
  navigation: AnyNavigator,
  context: NotificationRouterContext,
) {
  const { events, users, conversations, markNotificationRead, dispatchLocalAlert } = context;
  const raw = notification as any;

  // 1. Mark as read
  if (raw.id && markNotificationRead && !raw.is_read) {
    markNotificationRead(raw.id);
  }

  const kind = raw.kind || raw.type || '';
  const eventId = raw.event_id || raw.eventId;
  const conversationId = raw.conversation_id || raw.conversationId;
  const applicationId = raw.application_id || raw.applicationId;
  const rawTitle = (raw.title || '').trim();
  const rawMessage = (raw.message || raw.body || '').trim();

  // 2. Emergency Broadcast / SOS
  if (kind === 'EMERGENCY_BROADCAST' || kind === 'EMERGENCY_SOS') {
    const broadcasterName =
      rawTitle.replace(/^🚨\s*(?:EMERGENCY\s*SOS|NEARBY\s*EMERGENCY|SOS):\s*/i, '').trim() ||
      'Rotaract Member in Distress';
    const broadcaster = users.find(
      u => (raw.user_id && u.id === raw.user_id) ||
           (u.full_name && u.full_name.toLowerCase() === broadcasterName.toLowerCase()),
    );

    const clubMatch = rawMessage.match(/\((Rotaract Club of [^)]+|RC [^)]+|District 3800)\)/i);
    const clubName = clubMatch ? clubMatch[1] : (broadcaster?.club_name || 'District 3800');

    const msgMatch = rawMessage.match(/"([^"]+)"/);
    const customNote = msgMatch ? msgMatch[1] : '';

    const coordsMatch = rawMessage.match(/maps\.google\.com\/\?q=([0-9.-]+),([0-9.-]+)/);
    const lat = typeof raw.latitude === 'number'
      ? raw.latitude
      : (coordsMatch ? parseFloat(coordsMatch[1]) : 14.6948);
    const lng = typeof raw.longitude === 'number'
      ? raw.longitude
      : (coordsMatch ? parseFloat(coordsMatch[2]) : 120.9664);

    const addrMatch = rawMessage.match(/near\s+(.*?)(?:\.|\"|\s+Map:|\s+Location:|$)/i);
    const addressHint = addrMatch ? addrMatch[1].trim() : (customNote ? 'Coordinates provided' : rawMessage);

    if (dispatchLocalAlert) {
      dispatchLocalAlert({
        id: raw.id || `sos-${Date.now()}`,
        user_id: broadcaster?.id || raw.user_id,
        full_name: broadcaster?.full_name || broadcasterName,
        avatar_url: broadcaster?.avatar_url,
        club_id: broadcaster?.club_id || '',
        club_name: clubName,
        contact_number: broadcaster?.contact_number,
        latitude: lat,
        longitude: lng,
        status: 'ACTIVE',
        map_url: `https://maps.google.com/?q=${lat},${lng}`,
        address_hint: addressHint,
        message: customNote || undefined,
        created_at: raw.created_at || new Date().toISOString(),
        playSound: false,
      });
    }

    navigation.navigate('Main', { screen: 'MapTab' });
    return;
  }

  // 3. Direct Message / Event Inquiry / Group Chat
  if (conversationId || kind === 'INQUIRY_RECEIVED') {
    const conv = conversationId ? conversations.find(c => c.id === conversationId) : undefined;
    const senderName = rawTitle.replace(/^(?:Inquiry|New message)\s+from\s+/i, '').trim();
    const targetEvent = eventId ? events.find(e => e.id === eventId) : undefined;

    if (conv?.is_group) {
      navigation.navigate('Chat', {
        conversationId: conv.id,
        eventId: conv.event_id,
        recipientId: 'ALL_PARTICIPANTS',
        recipientName: `${conv.event_title ?? 'Event'} Group Chat`,
        eventTitle: conv.event_title,
      });
      return;
    }

    navigation.navigate('Chat', {
      conversationId: conversationId || conv?.id || '',
      eventId: eventId || conv?.event_id,
      recipientId: raw.sender_id || raw.user_id || '',
      recipientName: senderName || 'Direct Message',
      eventTitle: targetEvent?.title || conv?.event_title,
    });
    return;
  }

  // 4. Cohosting updates (Request, Approval, Payment, Rejection, Verification)
  // Evaluated BEFORE standard JOIN_REQUEST or EVENT_UPDATE so all cohost events route to CohostingScreen
  const isCohostKind =
    typeof kind === 'string' && (
      kind.startsWith('COHOST_') ||
      kind === 'COHOST_REQUEST' ||
      kind === 'COHOST_APPROVED' ||
      kind === 'COHOST_REJECTED' ||
      kind === 'COHOST_PAYMENT' ||
      kind === 'COHOST_PAYMENT_SUBMITTED' ||
      kind === 'COHOST_PAYMENT_VERIFIED'
    );

  const isCohostContent =
    /co-?host/i.test(rawTitle) ||
    /co-?host/i.test(rawMessage) ||
    /cohosting/i.test(rawTitle) ||
    /cohosting/i.test(rawMessage) ||
    (/payment\s+(?:verified|needs\s+attention|submitted)/i.test(rawTitle) && /cohost/i.test(rawMessage));

  if ((isCohostKind || isCohostContent) && eventId) {
    const eventExists = events.some(e => e.id === eventId);
    if (eventExists) {
      navigation.navigate('Cohosting', { eventId });
      return;
    }
    Alert.alert('Event Unavailable', 'This event is no longer active or was removed.');
    navigation.navigate('Main', { screen: 'EventsTab' });
    return;
  }

  // 5. Join Request -> Participants Screen directly
  if (kind === 'JOIN_REQUEST') {
    if (eventId) {
      const eventExists = events.some(e => e.id === eventId);
      if (eventExists) {
        navigation.navigate('Participants', { eventId });
        return;
      }
    }
    Alert.alert('Event Unavailable', 'This event is no longer active or was removed.');
    navigation.navigate('Main', { screen: 'EventsTab' });
    return;
  }

  // 6. Verification Application / Membership Request
  if (kind === 'VERIFICATION_UPDATE' || kind === 'MEMBERSHIP_REQUEST' || applicationId) {
    if (applicationId) {
      navigation.navigate('ApplicationReview', { applicationId });
      return;
    }
    // If no application ID or application already resolved -> Profile tab
    navigation.navigate('Main', { screen: 'ProfileTab' });
    return;
  }

  // 7. Role Assigned
  if (kind === 'ROLE_ASSIGNED') {
    navigation.navigate('Main', { screen: 'ProfileTab' });
    return;
  }

  // 8. General Event updates (Reminders, Approvals, Invitations, Details update)
  if (eventId) {
    const eventExists = events.some(e => e.id === eventId);
    if (eventExists) {
      navigation.navigate('EventDetail', { eventId });
      return;
    }
    Alert.alert('Event Unavailable', 'This event is no longer active or was removed.');
    navigation.navigate('Main', { screen: 'EventsTab' });
    return;
  }

  // 9. Default Fallback
  navigation.navigate('Main', { screen: 'InboxTab' });
}
