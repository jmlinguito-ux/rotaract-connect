import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { uploadPublicImage } from '../../services/storage';
import { useAppRefreshControl } from '../../hooks/useAppRefreshControl';
import { RootStackParamList } from '../../navigation/types';
import { getHighestRoleBadge, isAppAdmin, isDistrictAdmin, positionRoleLabel } from '../../utils/roles';
import UserAvatar from '../../components/UserAvatar';
import FullImageModal from '../../components/FullImageModal';
import RoleBadgeIcon from '../../components/RoleBadgeIcon';
import { VerifiedName } from '../../components/VerifiedCheck';
import EmergencySosButton from '../../components/EmergencySosButton';

export default function ProfileScreen() {
  const { user, signOut, updateAvatar } = useAuth();
  const { userStats } = useData();
  const { colors: themeColors } = useTheme();
  const refreshControl = useAppRefreshControl();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  if (!user) return null;
  const stats = userStats(user.id);
  const roleBadge = getHighestRoleBadge(user);

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
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      setUploadingAvatar(true);
      try {
        // Upload to Supabase Storage and persist the public URL — NOT the local
        // file:// uri, which would vanish on the next launch / other devices.
        const url = await uploadPublicImage('avatars', user.id, {
          uri: asset.uri,
          base64: asset.base64,
          mimeType: asset.mimeType,
          fileName: asset.fileName,
        });
        await updateAvatar(url);
      } catch (err: any) {
        Alert.alert('Upload Failed', err?.message || 'Could not upload your photo. Please try again.');
      } finally {
        setUploadingAvatar(false);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick image from photo library.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={refreshControl}>
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
              disabled={uploadingAvatar}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {uploadingAvatar
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="camera" size={12} color="#fff" />}
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
          <Text style={[styles.roleText, { color: themeColors.primary }]}>{positionRoleLabel(user.position, user)}</Text>
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
          {(isAppAdmin(user) || isDistrictAdmin(user)) && (
            <Row icon="key-outline" label="Roles & Permissions" colors={themeColors} onPress={() => navigation.navigate('RoleManagement')} />
          )}
          <Row icon="settings-outline" label="Settings" colors={themeColors} onPress={() => navigation.navigate('Settings')} />
        </View>

        <View style={{ marginHorizontal: 20, marginTop: 12 }}>
          <EmergencySosButton variant="full" />
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
  header: { alignItems: 'center', padding: 24, paddingBottom: 16 },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, zIndex: 3 },
  roleBadgePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  roleBadgePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  name: { fontSize: 22, fontWeight: '800' },
  username: { fontSize: 14, marginTop: 2 },
  roleText: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  clubPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, marginTop: 8 },
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
