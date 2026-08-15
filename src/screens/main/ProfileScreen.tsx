import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { RootStackParamList } from '../../navigation/types';
import { ROLE_BADGES } from '../../utils/roles';
import UserAvatar from '../../components/UserAvatar';
import FullImageModal from '../../components/FullImageModal';
import RoleBadgeIcon from '../../components/RoleBadgeIcon';
import { VerifiedName } from '../../components/VerifiedCheck';

export default function ProfileScreen() {
  const { user, signInAs, signOut, updateAvatar, demoUsers } = useAuth();
  const { userStats } = useData();
  const { colors: themeColors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);

  if (!user) return null;
  const stats = userStats(user.id);
  const roleBadge = ROLE_BADGES[user.role];

  const handlePickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Access to photos is required to change your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        updateAvatar(result.assets[0].uri);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image from photo library.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Demo Role Switcher */}
        <View style={[styles.roleBanner, { backgroundColor: themeColors.cardBg, borderBottomColor: themeColors.border }]}>
          <Text style={[styles.roleBannerTitle, { color: themeColors.textMuted }]}>SWITCH DEMO ROLE:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roleChips}>
            {demoUsers.map(u => {
              const active = u.id === user.id;
              return (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => signInAs(u.id)}
                  style={[
                    styles.roleChip,
                    {
                      backgroundColor: active ? themeColors.primary : themeColors.surface,
                      borderColor: active ? themeColors.primary : themeColors.border,
                    },
                  ]}
                >
                  <Text style={[styles.roleChipText, { color: active ? '#fff' : themeColors.text }]}>
                    {u.position}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            {/* Tapping the photo opens it full resolution; the camera button changes it. */}
            <UserAvatar
              user={user}
              size={92}
              onPressImage={uri => setFullImageUri(uri)}
              onPress={handlePickImage}
            />
            <TouchableOpacity
              style={[styles.cameraBadge, { backgroundColor: themeColors.primary, borderColor: themeColors.cardBg }]}
              onPress={handlePickImage}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="camera" size={12} color="#fff" />
            </TouchableOpacity>
          </View>
          {roleBadge ? (
            <View style={[styles.roleBadgePill, { backgroundColor: roleBadge.color + '1F', borderColor: roleBadge.color }]}>
              <RoleBadgeIcon badge={roleBadge} size={12} />
              <Text style={[styles.roleBadgePillText, { color: roleBadge.color }]}>{roleBadge.label}</Text>
            </View>
          ) : null}
          <VerifiedName
            user={user}
            textStyle={[styles.name, { color: themeColors.text }]}
            checkSize={18}
          />
          <Text style={[styles.username, { color: themeColors.textMuted }]}>@{user.username}</Text>
          <View style={[styles.clubPill, { backgroundColor: themeColors.primary + '1A' }]}>
            <Ionicons name="people" size={12} color={themeColors.primary} />
            <Text style={[styles.clubPillText, { color: themeColors.primary }]}>{user.club_name}</Text>
          </View>
        </View>

        <View style={[styles.statsRow, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Stat value={stats.joined} label="Joined" colors={themeColors} />
          <Stat value={stats.organized} label="Organized" colors={themeColors} />
          <Stat value={stats.hours} label="Hours Rendered" colors={themeColors} />
        </View>

        <View style={[styles.section, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Row icon="trophy-outline" label="Scoreboard" colors={themeColors} onPress={() => navigation.navigate('Scoreboard')} />
          <Row icon="ribbon-outline" label="Activity Portfolio" colors={themeColors} onPress={() => navigation.navigate('ActivityPortfolio')} />
          <Row icon="analytics-outline" label="District Analytics" colors={themeColors} onPress={() => navigation.navigate('Analytics')} />
          {user.role === 'APP_ADMIN' && (
            <Row icon="key-outline" label="Roles & Permissions" colors={themeColors} onPress={() => navigation.navigate('RoleManagement')} />
          )}
          <Row icon="settings-outline" label="Settings" colors={themeColors} onPress={() => navigation.navigate('Settings')} />
        </View>

        <TouchableOpacity style={styles.logout} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={themeColors.danger} />
          <Text style={[styles.logoutText, { color: themeColors.danger }]}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      <FullImageModal
        visible={!!fullImageUri}
        imageUri={fullImageUri}
        title={`${user.full_name}'s Profile Photo`}
        onClose={() => setFullImageUri(null)}
      />
    </SafeAreaView>
  );
}

function Stat({ value, label, colors: c }: { value: number; label: string; colors: any }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: c.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, badgeCount, colors: c, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; badgeCount?: number; colors: any; onPress?: () => void }) {
  return (
    <TouchableOpacity style={[styles.row, { borderBottomColor: c.border }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={c.text} />
      <Text style={[styles.rowText, { color: c.text }]}>{label}</Text>
      {badgeCount !== undefined && badgeCount > 0 ? (
        <View style={[styles.countBadge, { backgroundColor: c.primary }]}>
          <Text style={styles.countBadgeText}>{badgeCount}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  roleBanner: { padding: 12, borderBottomWidth: 1 },
  roleBannerTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  roleChips: { gap: 6 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  roleChipText: { fontSize: 11, fontWeight: '700' },
  header: { alignItems: 'center', padding: 24, paddingBottom: 16 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, zIndex: 3 },
  roleBadgePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  roleBadgePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  name: { fontSize: 22, fontWeight: '800' },
  username: { fontSize: 14, marginTop: 2 },
  clubPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, marginTop: 10 },
  clubPillText: { fontSize: 12, fontWeight: '700' },
  role: { fontSize: 12, marginTop: 6, letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  section: { marginHorizontal: 16, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, fontSize: 15 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, padding: 14 },
  logoutText: { fontSize: 15, fontWeight: '700' },
});
