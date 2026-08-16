import React, { useState } from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { AppUser, UserRole } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import UserAvatar from './UserAvatar';
import FullImageModal from './FullImageModal';
import { ASSIGNABLE_ROLES, ROLE_LABELS, positionRoleLabel } from '../utils/roles';
import { VerifiedName } from './VerifiedCheck';

interface UserProfileModalProps {
  visible: boolean;
  targetUser: AppUser | null;
  onClose: () => void;
  /** `aboutEvent` is true when the user chose to message regarding the event. */
  onStartChat?: (targetUser: AppUser, aboutEvent: boolean) => void;
  /** When opened from an event, offers a "message about this event" choice. */
  eventContext?: { eventId: string; eventTitle: string };
}

export function UserProfileModal({
  visible,
  targetUser,
  onClose,
  onStartChat,
  eventContext,
}: UserProfileModalProps) {
  const { user: currentUser, updateProfile } = useAuth();
  const { users, userStats, updateUserRole } = useData();
  const { colors } = useTheme();
  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [isRolePickerOpen, setIsRolePickerOpen] = useState(false);
  const [roleNotice, setRoleNotice] = useState<{ text: string; error: boolean } | null>(null);

  if (!targetUser) return null;

  const stats = userStats(targetUser.id);
  const isMe = currentUser?.id === targetUser.id;
  const isAppAdmin = currentUser?.role === 'APP_ADMIN';

  const appAdminCount = users.filter(u => u.role === 'APP_ADMIN').length;

  // Feedback is inline rather than an Alert: React Native Web has no Alert, so an
  // Alert-only result would be invisible in the browser build.
  const handleAssignRole = (role: UserRole) => {
    setIsRolePickerOpen(false);
    if (targetUser.role === role) return;

    if (targetUser.role === 'APP_ADMIN' && role !== 'APP_ADMIN' && appAdminCount <= 1) {
      setRoleNotice({
        text: 'This is the last App Admin. Assign App Admin to someone else first.',
        error: true,
      });
      return;
    }

    updateUserRole(targetUser.id, role, currentUser ?? undefined);
    // AuthContext keeps its own copy of the signed-in user.
    if (currentUser?.id === targetUser.id) updateProfile({ role });
    setRoleNotice({ text: `${targetUser.full_name} is now ${ROLE_LABELS[role]}. They have been notified.`, error: false });
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg }]} activeOpacity={1} onPress={e => e.stopPropagation()}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Avatar & Header */}
            <View style={styles.avatarWrap}>
              <UserAvatar
                user={targetUser}
                size={76}
                showBadge
                onPressImage={(uri) => setFullImageUri(uri)}
              />
            </View>

            <VerifiedName user={targetUser} textStyle={[styles.name, { color: colors.text }]} checkSize={16} />
            <Text style={[styles.clubText, { color: colors.primary }]}>{targetUser.club_name}</Text>
            <Text style={[styles.positionText, { color: colors.textMuted }]}>{positionRoleLabel(targetUser.position, targetUser.role)}</Text>

            {/* App Admin Role Assignment Panel */}
            {isAppAdmin && (
              <View style={styles.adminRoleSection}>
                <TouchableOpacity
                  style={[styles.adminRoleBtn, { borderColor: colors.primary + '3D', backgroundColor: colors.primary + '0D' }]}
                  onPress={() => setIsRolePickerOpen(!isRolePickerOpen)}
                >
                  <Ionicons name="key" size={14} color={colors.primary} />
                  <Text style={[styles.adminRoleBtnText, { color: colors.primary }]}>Assign Role: {ROLE_LABELS[targetUser.role]}</Text>
                  <Ionicons name={isRolePickerOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
                </TouchableOpacity>

                {isRolePickerOpen && (
                  <View style={[styles.roleMenu, { borderColor: colors.border, backgroundColor: colors.cardBg }]}>
                    {ASSIGNABLE_ROLES.map(role => {
                      const isSelected = targetUser.role === role;
                      return (
                        <TouchableOpacity
                          key={role}
                          style={[styles.roleMenuItem, { borderBottomColor: colors.border }, isSelected && { backgroundColor: colors.primary + '1A' }]}
                          onPress={() => handleAssignRole(role)}
                        >
                          <Text style={[styles.roleMenuText, { color: colors.text }, isSelected && { color: colors.primary, fontWeight: '800' }]}>
                            {ROLE_LABELS[role]}
                          </Text>
                          {isSelected && <Ionicons name="checkmark-circle" size={16} color={colors.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {roleNotice ? (
                  <Text style={[styles.roleNotice, roleNotice.error && { color: colors.danger }]}>
                    {roleNotice.text}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Stats Grid */}
            <View style={[styles.statsGrid, { borderTopColor: colors.border }]}>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: colors.text }]}>{stats.joined}</Text>
                <Text style={[styles.statLbl, { color: colors.textMuted }]}>Joined</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: colors.text }]}>{stats.organized}</Text>
                <Text style={[styles.statLbl, { color: colors.textMuted }]}>Organized</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: colors.text }]}>{stats.hours}h</Text>
                <Text style={[styles.statLbl, { color: colors.textMuted }]}>Volunteer</Text>
              </View>
            </View>

            {/* Direct Action Button(s): when opened from an event, let the user
                choose to message about that event or just send a plain message. */}
            {!isMe && onStartChat && (
              eventContext ? (
                <View style={styles.chatChoiceGroup}>
                  <TouchableOpacity
                    style={[styles.chatBtn, { backgroundColor: colors.primary, marginTop: 0 }]}
                    onPress={() => { onClose(); onStartChat(targetUser, true); }}
                  >
                    <Ionicons name="pricetag" size={16} color="#fff" />
                    <Text style={styles.chatBtnText} numberOfLines={1}>Message about event</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.chatBtnSecondary, { borderColor: colors.primary }]}
                    onPress={() => { onClose(); onStartChat(targetUser, false); }}
                  >
                    <Ionicons name="chatbubble-ellipses" size={16} color={colors.primary} />
                    <Text style={[styles.chatBtnText, { color: colors.primary }]}>Just send a message</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.chatBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { onClose(); onStartChat(targetUser, false); }}
                >
                  <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
                  <Text style={styles.chatBtnText}>Send Direct Message</Text>
                </TouchableOpacity>
              )
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <FullImageModal
        visible={!!fullImageUri}
        imageUri={fullImageUri}
        title={`${targetUser.full_name}'s Profile Photo`}
        onClose={() => setFullImageUri(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24, alignItems: 'center', position: 'relative' },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 4, zIndex: 10 },
  avatarWrap: { marginBottom: 12 },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  avatarCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: '#fff', fontSize: 24, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  clubText: { fontSize: 13, fontWeight: '600', color: colors.primary, marginTop: 2, textAlign: 'center' },
  positionText: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EBF9F3', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 8 },
  verifiedText: { fontSize: 11, fontWeight: '700', color: colors.success },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  statBox: { alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800', color: colors.text },
  statLbl: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, width: '100%', paddingVertical: 12, borderRadius: 12, marginTop: 18 },
  chatBtnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  chatChoiceGroup: { width: '100%', gap: 8, marginTop: 18 },
  chatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  adminRoleSection: { width: '100%', marginTop: 14 },
  adminRoleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.primary + '3D', backgroundColor: colors.primary + '0D' },
  adminRoleBtnText: { fontSize: 12, fontWeight: '700', color: colors.primary, flex: 1, marginHorizontal: 6 },
  roleMenu: { marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', overflow: 'hidden' },
  roleMenuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  roleMenuText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  roleNotice: { fontSize: 11, fontWeight: '700', color: colors.success, marginTop: 6 },
});
