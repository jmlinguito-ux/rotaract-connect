import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { zones } from '../../data/mockData';
import { EventCard } from '../main/MapScreen';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { canMessageUser, inquiryBlockedMessage } from '../../utils/messaging';
import { openNavigationApp } from '../../utils/navigationLauncher';
import { AppUser } from '../../types';
import { UserProfileModal } from '../../components/UserProfileModal';
import UserAvatar from '../../components/UserAvatar';
import RotaryWheel from '../../components/RotaryWheel';
import ClubLogo from '../../components/ClubLogo';
import { VerifiedName } from '../../components/VerifiedCheck';
import { visibleEvents } from '../../utils/eventApproval';

type Props = NativeStackScreenProps<RootStackParamList, 'ClubDetail'>;

export default function ClubDetailScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { clubs, events, users, participants, getOrCreateConversation } = useData();
  const { colors: themeColors } = useTheme();
  const [showMembers, setShowMembers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  const club = clubs.find(c => c.id === route.params.clubId);
  if (!club) return <Text style={{ padding: 20 }}>Club not found.</Text>;
  const zone = zones.find(z => z.id === club.zone_id);
  const upcoming = visibleEvents(events, user, users, participants)
    .filter(e => e.organizing_club_id === club.id || e.participating_club_ids.includes(club.id));
  const clubMembers = users.filter(u => u.club_id === club.id);
  const presidentUser = users.find(u => u.id === club.president_id || u.full_name === club.president_name);

  const [blockedName, setBlockedName] = useState<string | null>(null);

  const handleChatWithMember = (targetUser: AppUser | { id: string; full_name: string }) => {
    if (!user) return;
    const full = users.find(u => u.id === targetUser.id);
    if (!canMessageUser(full, user)) { setBlockedName(targetUser.full_name); return; }
    const conv = getOrCreateConversation(undefined, user, targetUser.id, targetUser.full_name);
    navigation.navigate('Chat', {
      conversationId: conv.id,
      recipientId: targetUser.id,
      recipientName: targetUser.full_name,
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.header, { backgroundColor: themeColors.primary + '1A' }]}>
          <ClubLogo size={80} />
          <Text style={[styles.name, { color: themeColors.text }]}>{club.club_name}</Text>
          
          <View
            style={[
              styles.charterBadge,
              club.club_type === 'INSTITUTION_BASED'
                ? { backgroundColor: '#EDE9FE', borderColor: '#8B5CF6' }
                : { backgroundColor: '#E0F2FE', borderColor: '#0284C7' },
            ]}
          >
            <Ionicons
              name={club.club_type === 'INSTITUTION_BASED' ? 'school' : 'business'}
              size={12}
              color={club.club_type === 'INSTITUTION_BASED' ? '#6D28D9' : '#0369A1'}
            />
            <Text
              style={[
                styles.charterBadgeText,
                { color: club.club_type === 'INSTITUTION_BASED' ? '#6D28D9' : '#0369A1' },
              ]}
            >
              {club.club_type === 'INSTITUTION_BASED'
                ? `University-Based${club.institution_name ? ` (${club.institution_name})` : ''}`
                : 'Community-Based Club'}
            </Text>
          </View>

          <Text style={[styles.meta, { color: themeColors.textMuted }]}>{zone?.zone_name} • {club.city}, {club.province}</Text>
          <Text style={[styles.clubId, { color: themeColors.textMuted }]}>{club.club_code}</Text>

          <TouchableOpacity
            style={[styles.clubDirectionsBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            onPress={() => openNavigationApp(club.latitude, club.longitude, club.club_name, `${club.city}, ${club.province}`)}
          >
            <Ionicons name="navigate-outline" size={13} color={themeColors.primary} />
            <Text style={[styles.clubDirectionsBtnText, { color: themeColors.primary }]}>Get Directions</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.statsRow, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          <Stat value={clubMembers.length || club.member_count} label="Members" colors={themeColors} onPress={() => setShowMembers(prev => !prev)} />
          <Stat value={upcoming.length} label="Events" colors={themeColors} />
          <Stat value={0} label="Completed" colors={themeColors} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>About</Text>
          <Text style={[styles.about, { color: themeColors.text }]}>{club.description}</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>President</Text>
          <TouchableOpacity
            style={[styles.presidentRow, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
            onPress={() => presidentUser && setSelectedUser(presidentUser)}
            activeOpacity={0.8}
          >
            <UserAvatar
              user={presidentUser ?? { full_name: club.president_name, role: 'CLUB_PRESIDENT' }}
              size={44}
            />
            <View style={{ flex: 1 }}>
              <VerifiedName
                user={presidentUser}
                name={club.president_name}
                textStyle={[styles.presidentName, { color: themeColors.text }]}
              />
              <Text style={[styles.meta, { color: themeColors.textMuted }]}>Club President</Text>
            </View>
            <TouchableOpacity
              style={[styles.chatIconBtn, { backgroundColor: themeColors.primary + '1A', borderColor: themeColors.primary + '3D' }]}
              onPress={(e) => {
                e.stopPropagation();
                const target = presidentUser || { id: club.president_id || 'u_pres', full_name: club.president_name };
                handleChatWithMember(target);
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={themeColors.primary} />
            </TouchableOpacity>
          </TouchableOpacity>
        </View>

        {/* Club Members Roster Section */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => setShowMembers(prev => !prev)}>
            <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>Club Members ({clubMembers.length})</Text>
            <Ionicons name={showMembers ? 'chevron-up' : 'chevron-down'} size={18} color={themeColors.primary} />
          </TouchableOpacity>

          {showMembers && (
            <View style={styles.membersList}>
              {clubMembers.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.memberCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
                  onPress={() => setSelectedUser(m)}
                  activeOpacity={0.8}
                >
                  <UserAvatar user={m} size={44} />
                  <View style={{ flex: 1 }}>
                    <VerifiedName
                      user={m}
                      textStyle={[styles.memberName, { color: themeColors.text }]}
                      numberOfLines={1}
                    />
                    <Text style={[styles.memberMeta, { color: themeColors.textMuted }]}>{m.position}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.chatIconBtn, { backgroundColor: themeColors.primary + '1A', borderColor: themeColors.primary + '3D' }]}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleChatWithMember(m);
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={themeColors.primary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {upcoming.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>Upcoming Events</Text>
            {upcoming.map(e => (
              <View key={e.id} style={{ marginTop: 10 }}>
                <EventCard event={e} onPress={() => navigation.navigate('EventDetail', { eventId: e.id })} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <UserProfileModal
        visible={!!selectedUser}
        targetUser={selectedUser}
        onClose={() => setSelectedUser(null)}
        onStartChat={(targetUser) => handleChatWithMember(targetUser)}
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

function Stat({ value, label, colors: c, onPress }: { value: number; label: string; colors: any; onPress?: () => void }) {
  return (
    <TouchableOpacity style={styles.stat} onPress={onPress}>
      <Text style={[styles.statValue, { color: c.primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { alignItems: 'center', padding: 24 },
  logo: { width: 80, height: 80, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  charterBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1, marginTop: 8 },
  charterBadgeText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 6 },
  clubId: { fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  clubDirectionsBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, marginTop: 10 },
  clubDirectionsBtnText: { fontSize: 11, fontWeight: '700' },
  statsRow: { flexDirection: 'row', margin: 16, borderRadius: 14, borderWidth: 1, padding: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  section: { paddingHorizontal: 20, marginTop: 12, marginBottom: 8 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  about: { fontSize: 14, lineHeight: 20 },
  presidentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  presidentName: { fontSize: 15, fontWeight: '700' },
  membersList: { gap: 8, marginTop: 4 },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  memberName: { fontSize: 14, fontWeight: '700' },
  memberMeta: { fontSize: 12, marginTop: 1 },
  chatIconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
