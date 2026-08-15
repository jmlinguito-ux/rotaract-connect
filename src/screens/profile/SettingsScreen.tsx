import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import RoleBadgeIcon from '../../components/RoleBadgeIcon';
import { VerifiedName } from '../../components/VerifiedCheck';
import { ROLE_BADGES } from '../../utils/roles';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { isNightMode, setNightMode, colors: themeColors } = useTheme();

  // Settings state
  const [eventReminders, setEventReminders] = useState(true);
  const [inquiryAlerts, setInquiryAlerts] = useState(true);
  const [joinRequestsAlerts, setJoinRequestsAlerts] = useState(true);
  const [districtAnnouncements, setDistrictAnnouncements] = useState(true);

  const [allowDirectInquiries, setAllowDirectInquiries] = useState(true);
  const [showMapStatus, setShowMapStatus] = useState(true);
  
  const [highAccuracyGps, setHighAccuracyGps] = useState(true);
  const [checkInRadius, setCheckInRadius] = useState<'250' | '500' | '1000'>('500');

  if (!user) return null;

  const roleBadge = ROLE_BADGES[user.role];

  const handleSaveProfile = () => {
    Alert.alert('Settings Saved', 'Your preferences have been updated successfully.');
  };

  const cardStyle = [styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }];
  const titleStyle = [styles.rowTitle, { color: themeColors.text }];
  const subStyle = [styles.rowSub, { color: themeColors.textMuted }];
  const dividerStyle = [styles.divider, { backgroundColor: themeColors.border }];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* 🌙 APPEARANCE & THEME */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>APPEARANCE</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name={isNightMode ? 'moon' : 'sunny'} size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Night Mode</Text>
                <Text style={subStyle}>Switch between dark and light theme</Text>
              </View>
              <Switch
                value={isNightMode}
                onValueChange={v => setNightMode(v)}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* 👤 ACCOUNT & MEMBERSHIP PROFILE */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>ACCOUNT & MEMBERSHIP</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="person-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <VerifiedName user={user} textStyle={titleStyle} checkSize={14} />
                <Text style={subStyle}>{user.position} • {user.club_name}</Text>
              </View>
              {roleBadge ? (
                <View style={[styles.roleChip, { backgroundColor: roleBadge.color + '1F', borderColor: roleBadge.color }]}>
                  <RoleBadgeIcon badge={roleBadge} size={11} />
                  <Text style={[styles.roleChipText, { color: roleBadge.color }]}>{roleBadge.label}</Text>
                </View>
              ) : null}
            </View>

            <View style={dividerStyle} />

            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Rotary Member ID', `Your ID: 1048${user.id.replace(/[^0-9]/g, '').padStart(4, '0').slice(-4)}`)}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="card-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Rotary International ID</Text>
                <Text style={subStyle}>RI ID: 1048{user.id.replace(/[^0-9]/g, '').padStart(4, '0').slice(-4)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Email Address', user.email)}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="mail-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Email Address</Text>
                <Text style={subStyle}>{user.email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 🔔 NOTIFICATION PREFERENCES */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>NOTIFICATION PREFERENCES</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="alarm-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Event Reminders</Text>
                <Text style={subStyle}>Alerts for upcoming events and check-ins</Text>
              </View>
              <Switch
                value={eventReminders}
                onValueChange={setEventReminders}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Inquiries & Messages</Text>
                <Text style={subStyle}>Direct messages from Rotaractors</Text>
              </View>
              <Switch
                value={inquiryAlerts}
                onValueChange={setInquiryAlerts}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="person-add-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Join Requests & Approvals</Text>
                <Text style={subStyle}>Notifications for event registrations</Text>
              </View>
              <Switch
                value={joinRequestsAlerts}
                onValueChange={setJoinRequestsAlerts}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="megaphone-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>District Announcements</Text>
                <Text style={subStyle}>District 3800 news and updates</Text>
              </View>
              <Switch
                value={districtAnnouncements}
                onValueChange={setDistrictAnnouncements}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* 🔒 PRIVACY & VISIBILITY */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>PRIVACY & VISIBILITY</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="chatbubbles-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Allow Direct Inquiries</Text>
                <Text style={subStyle}>Let members outside your club message you</Text>
              </View>
              <Switch
                value={allowDirectInquiries}
                onValueChange={setAllowDirectInquiries}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="map-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Show Active Status on Map</Text>
                <Text style={subStyle}>Visible during ongoing events</Text>
              </View>
              <Switch
                value={showMapStatus}
                onValueChange={setShowMapStatus}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        {/* 📍 GPS & CHECK-IN SETTINGS */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>GPS & EVENT CHECK-IN</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="navigate-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>High Accuracy GPS</Text>
                <Text style={subStyle}>Recommended for precise check-ins</Text>
              </View>
              <Switch
                value={highAccuracyGps}
                onValueChange={setHighAccuracyGps}
                trackColor={{ false: themeColors.border, true: themeColors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.columnRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                  <Ionicons name="radio-outline" size={18} color={themeColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={titleStyle}>Allowed Check-In Distance</Text>
                  <Text style={subStyle}>Max radius from venue for check-in</Text>
                </View>
              </View>
              <View style={styles.radiusPills}>
                {(['250', '500', '1000'] as const).map(rad => {
                  const active = checkInRadius === rad;
                  return (
                    <TouchableOpacity
                      key={rad}
                      style={[
                        styles.radiusPill,
                        { backgroundColor: active ? themeColors.primary : themeColors.surface, borderColor: active ? themeColors.primary : themeColors.border },
                      ]}
                      onPress={() => setCheckInRadius(rad)}
                    >
                      <Text style={[styles.radiusText, { color: active ? '#fff' : themeColors.textMuted }]}>
                        {rad === '1000' ? '1 km' : `${rad}m`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* ℹ️ SUPPORT & APP INFO */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>SUPPORT & INFORMATION</Text>
          <View style={cardStyle}>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('App Information', 'Rotaract Connect v1.0.0\nDistrict 3800 Philippines')}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="information-circle-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>App Version</Text>
                <Text style={subStyle}>v1.0.0 (District 3800)</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Rotary International Guidelines', 'Visit rotary.org for official Rotaract policies and codes of conduct.')}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="document-text-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Rotary International Guidelines</Text>
                <Text style={subStyle}>Code of conduct and policies</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.primary }]} onPress={handleSaveProfile}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.saveBtnText}>Save Preferences</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  columnRow: { paddingVertical: 12 },
  rowIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 1 },
  divider: { height: 1, marginLeft: 46 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  roleChipText: { fontSize: 10, fontWeight: '800' },
  radiusPills: { flexDirection: 'row', gap: 8, marginTop: 12, marginLeft: 44 },
  radiusPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  radiusText: { fontSize: 12, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: 12, marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
