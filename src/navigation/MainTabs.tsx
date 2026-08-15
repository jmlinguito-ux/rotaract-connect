import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { MainTabParamList } from './types';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import MapScreen from '../screens/main/MapScreen';
import EventsScreen from '../screens/main/EventsScreen';
import ClubsScreen from '../screens/main/ClubsScreen';
import InboxScreen from '../screens/main/InboxScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  const { user } = useAuth();
  const { notificationsFor } = useData();
  const { colors: themeColors } = useTheme();

  const unreadCount = user ? notificationsFor(user.id).filter(n => !n.is_read).length : 0;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: themeColors.textMuted,
        tabBarStyle: { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border },
        headerStyle: { backgroundColor: themeColors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            MapTab: 'map',
            EventsTab: 'calendar',
            ClubsTab: 'people',
            InboxTab: 'mail',
            ProfileTab: 'person-circle',
          };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="MapTab" component={MapScreen} options={{ title: 'Explore' }} />
      <Tab.Screen name="EventsTab" component={EventsScreen} options={{ title: 'Events' }} />
      <Tab.Screen name="ClubsTab" component={ClubsScreen} options={{ title: 'Clubs' }} />
      <Tab.Screen
        name="InboxTab"
        component={InboxScreen}
        options={{
          title: 'Inbox',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, color: '#fff', fontSize: 11, fontWeight: '800' },
        }}
      />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

