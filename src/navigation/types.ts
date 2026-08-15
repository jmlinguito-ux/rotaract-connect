import { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ClubSelect: { onSelect?: (clubId: string) => void } | undefined;
  VerificationPending: undefined;
};

export type MainTabParamList = {
  MapTab: undefined;
  EventsTab: undefined;
  ClubsTab: undefined;
  InboxTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
  EventDetail: { eventId: string };
  ClubDetail: { clubId: string };
  CreateEvent: undefined;
  EditEvent: { eventId: string };
  InvitePicker: { eventId: string };
  Participants: { eventId: string };
  MarkAttendance: { eventId: string };
  CompleteEvent: { eventId: string };
  Notifications: undefined;
  VerificationQueue: undefined;
  ApplicationReview: { applicationId: string };
  ActivityPortfolio: { initialFilter?: 'ATTENDED' | 'JOINED' | 'ORGANIZED' } | undefined;
  Analytics: undefined;
  Scoreboard: undefined;
  Chat: { conversationId: string; eventId?: string; recipientId: string; recipientName: string; eventTitle?: string };
  Settings: undefined;
  RoleManagement: undefined;
};
