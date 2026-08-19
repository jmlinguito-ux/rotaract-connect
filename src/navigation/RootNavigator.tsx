import React, { useEffect } from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { navigationRef } from './navigationRef';
import { PushNotifications } from '../components/PushNotifications';
import { SyncErrorBanner } from '../components/SyncErrorBanner';
import { SyncStatusBanner } from '../components/SyncStatusBanner';
import { StatusBar } from 'expo-status-bar';
import { RootStackParamList } from './types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useAutoCheckIn } from '../hooks/useAutoCheckIn';
import AuthStack from './AuthStack';
import MainTabs from './MainTabs';
import EventDetailScreen from '../screens/events/EventDetailScreen';
import ClubDetailScreen from '../screens/clubs/ClubDetailScreen';
import CreateEventScreen from '../screens/events/CreateEventScreen';
import EditEventScreen from '../screens/events/EditEventScreen';
import InvitePickerScreen from '../screens/events/InvitePickerScreen';
import ParticipantsScreen from '../screens/events/ParticipantsScreen';
import MarkAttendanceScreen from '../screens/events/MarkAttendanceScreen';
import CompleteEventScreen from '../screens/events/CompleteEventScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import VerificationQueueScreen from '../screens/verification/VerificationQueueScreen';
import ApplicationReviewScreen from '../screens/verification/ApplicationReviewScreen';
import ActivityPortfolioScreen from '../screens/profile/ActivityPortfolioScreen';
import AnalyticsScreen from '../screens/analytics/AnalyticsScreen';
import ScoreboardScreen from '../screens/scoreboard/ScoreboardScreen';
import ChatScreen from '../screens/messaging/ChatScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import RoleManagementScreen from '../screens/admin/RoleManagementScreen';
import OrganizerBroadcastScreen from '../screens/events/OrganizerBroadcastScreen';
import AuditLogsScreen from '../screens/admin/AuditLogsScreen';
import CertificateScannerScreen from '../screens/verification/CertificateScannerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const { isNightMode, colors: themeColors } = useTheme();

  const navTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: themeColors.bg,
      card: themeColors.cardBg,
      text: themeColors.text,
      border: themeColors.border,
      primary: themeColors.primary,
    },
  };

  // Nothing renders until the stored session is known: the native splash is still
  // covering the screen, so there is no frame in which the auth stack can appear.
  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync().catch(() => {});
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <StatusBar style={isNightMode ? 'light' : 'dark'} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: themeColors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="EventDetail" component={EventDetailScreen} options={{ title: 'Event' }} />
            <Stack.Screen name="ClubDetail" component={ClubDetailScreen} options={{ title: 'Club' }} />
            <Stack.Screen name="CreateEvent" component={CreateEventScreen} options={{ title: 'Create Event' }} />
            <Stack.Screen name="EditEvent" component={EditEventScreen} options={{ title: 'Edit Event' }} />
            <Stack.Screen name="InvitePicker" component={InvitePickerScreen} options={{ title: 'Invite Rotaractors' }} />
            <Stack.Screen name="Participants" component={ParticipantsScreen} options={{ title: 'Participants' }} />
            <Stack.Screen name="MarkAttendance" component={MarkAttendanceScreen} options={{ title: 'Check-In Participants' }} />
            <Stack.Screen name="CompleteEvent" component={CompleteEventScreen} options={{ title: 'Record Impact' }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
            <Stack.Screen name="VerificationQueue" component={VerificationQueueScreen} options={{ title: 'Verification Queue' }} />
            <Stack.Screen name="ApplicationReview" component={ApplicationReviewScreen} options={{ title: 'Application Review' }} />
            <Stack.Screen name="ActivityPortfolio" component={ActivityPortfolioScreen} options={{ title: 'Activity Portfolio' }} />
            <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Analytics Dashboard' }} />
            <Stack.Screen name="Scoreboard" component={ScoreboardScreen} options={{ title: 'Member Scoreboard' }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={({ route }) => ({ title: route.params.recipientName || 'Chat', gestureEnabled: false })} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings & Preferences' }} />
            <Stack.Screen name="RoleManagement" component={RoleManagementScreen} options={{ title: 'Roles & Permissions' }} />
            <Stack.Screen name="OrganizerBroadcast" component={OrganizerBroadcastScreen} options={{ title: 'Send Banner Notification' }} />
            <Stack.Screen name="AuditLogs" component={AuditLogsScreen} options={{ title: 'Audit & Governance' }} />
            <Stack.Screen name="CertificateScanner" component={CertificateScannerScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthStack} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
      <PushNotifications />
      {isAuthenticated && (
        <>
          <SyncErrorBanner />
          <SyncStatusBanner />
          <AutoCheckInWatcher />
        </>
      )}
    </NavigationContainer>
  );
}

function AutoCheckInWatcher() {
  useAutoCheckIn();
  return null;
}
