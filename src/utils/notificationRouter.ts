import { NavigationProp } from '@react-navigation/native';
import { Alert } from 'react-native';
import { AppNotification, AppUser, RotaractEvent, Conversation } from '../types';
import { RootStackParamList } from '../navigation/types';

export interface NotificationRouterContext {
  user: AppUser | null;
  events: RotaractEvent[];
  users: AppUser[];
  conversations: Conversation[];
  markNotificationRead?: (id: string) => void;
  dispatchLocalAlert?: (alert: any) => void;
}

/**
 * Single source of truth for routing user taps on notifications
 * (in-app notifications list, inbox, and OS push notifications).
 */
export function handleAppNotificationNavigation(
  notification: AppNotification | { [key: string]: any },
  navigation: NavigationProp<RootStackParamList>,
  context: NotificationRouterContext,
) {
  const { user, events, users, conversations, markNotificationRead, dispatchLocalAlert } = context;

  // 1. Mark as read
  if (notification.id && markNotificationRead && !notification.is_read) {
    markNotificationRead(notification.id);
  }

  const kind = notification.kind || notification.type;
  const eventId = notification.event_id || notification.eventId;
  const conversationId = notification.conversation_id || notification.conversationId;
  const applicationId = notification.application_id || notification.applicationId;
  const rawTitle = (notification.title || '').trim();
  const rawMessage = (notification.message || notification.body || '').trim();

  // 2. Emergency Broadcast / SOS
  if (kind === 'EMERGENCY_BROADCAST' || kind === 'EMERGENCY_SOS') {
    const broadcasterName =
      rawTitle.replace(/^🚨\s*(?:EMERGENCY\s*SOS|NEARBY\s*EMERGENCY|SOS):\s*/i, '').trim() ||
      'Rotaract Member in Distress';
    const broadcaster = users.find(
      u => (notification.user_id && u.id === notification.user_id) ||
           (u.full_name && u.full_name.toLowerCase() === broadcasterName.toLowerCase()),
    );

    const clubMatch = rawMessage.match(/\((Rotaract Club of [^)]+|RC [^)]+|District 3800)\)/i);
    const clubName = clubMatch ? clubMatch[1] : (broadcaster?.club_name || 'District 3800');

    const msgMatch = rawMessage.match(/"([^"]+)"/);
    const customNote = msgMatch ? msgMatch[1] : '';

    const coordsMatch = rawMessage.match(/maps\.google\.com\/\?q=([0-9.-]+),([0-9.-]+)/);
    const lat = typeof notification.latitude === 'number'
      ? notification.latitude
      : (coordsMatch ? parseFloat(coordsMatch[1]) : 14.6948);
    const lng = typeof notification.longitude === 'number'
      ? notification.longitude
      : (coordsMatch ? parseFloat(coordsMatch[2]) : 120.9664);

    const addrMatch = rawMessage.match(/near\s+(.*?)(?:\.|\"|\s+Map:|\s+Location:|$)/i);
    const addressHint = addrMatch ? addrMatch[1].trim() : (customNote ? 'Coordinates provided' : rawMessage);

    if (dispatchLocalAlert) {
      dispatchLocalAlert({
        id: notification.id || `sos-${Date.now()}`,
        user_id: broadcaster?.id || notification.user_id,
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
        created_at: notification.created_at || new Date().toISOString(),
        playSound: false,
      });
    }

    navigation.navigate('Main', { screen: 'MapTab' } as any);
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
      recipientId: notification.sender_id || notification.user_id || '',
      recipientName: senderName || 'Direct Message',
      eventTitle: targetEvent?.title || conv?.event_title,
    });
    return;
  }

  // 4. Join Request -> Participants Screen directly
  if (kind === 'JOIN_REQUEST') {
    if (eventId) {
      const eventExists = events.some(e => e.id === eventId);
      if (eventExists) {
        navigation.navigate('Participants', { eventId });
        return;
      }
    }
    Alert.alert('Event Unavailable', 'This event is no longer active or was removed.');
    navigation.navigate('Main', { screen: 'EventsTab' } as any);
    return;
  }

  // 5. Cohosting updates (Request, Approval, Payment, Rejection)
  const isCohostRelated =
    kind === 'COHOST_REQUEST' ||
    kind === 'COHOST_APPROVED' ||
    kind === 'COHOST_PAYMENT' ||
    rawTitle.toLowerCase().includes('cohost') ||
    rawMessage.toLowerCase().includes('cohost');

  if (isCohostRelated && eventId) {
    const eventExists = events.some(e => e.id === eventId);
    if (eventExists) {
      navigation.navigate('Cohosting', { eventId });
      return;
    }
  }

  // 6. Verification Application / Membership Request
  if (kind === 'VERIFICATION_UPDATE' || kind === 'MEMBERSHIP_REQUEST' || applicationId) {
    if (applicationId) {
      navigation.navigate('ApplicationReview', { applicationId });
      return;
    }
    // If no application ID or application already resolved -> Profile tab
    navigation.navigate('Main', { screen: 'ProfileTab' } as any);
    return;
  }

  // 7. Role Assigned
  if (kind === 'ROLE_ASSIGNED') {
    navigation.navigate('Main', { screen: 'ProfileTab' } as any);
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
    navigation.navigate('Main', { screen: 'EventsTab' } as any);
    return;
  }

  // 9. Default Fallback
  navigation.navigate('Main', { screen: 'InboxTab' } as any);
}
