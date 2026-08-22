import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppUser, SystemRole, ClubRole } from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import UserAvatar from './UserAvatar';
import { VerifiedName } from './VerifiedCheck';
import FullImageModal from './FullImageModal';
import {
  isAppAdmin,
  isDistrictAdmin,
  isClubPresident,
  getSystemRole,
  getClubRole,
  positionRoleLabel,
  SYSTEM_ROLE_LABELS,
  CLUB_ROLE_LABELS,
  ROTARACT_POSITIONS,
  getPositionClubRole,
} from '../utils/roles';

interface Props {
  targetUser: AppUser | null;
  visible: boolean;
  onClose: () => void;
  onStartChat?: (user: AppUser, aboutEvent?: boolean) => void;
  eventContext?: boolean | { eventId: string; eventTitle: string };
  inquiriesBlocked?: boolean;
}

export function UserProfileModal({
  targetUser,
  visible,
  onClose,
  onStartChat,
  eventContext,
  inquiriesBlocked,
}: Props) {
  const { user: currentUser } = useAuth();
  const { users, userStats, updateUserRole } = useData();
  const { colors } = useTheme();

  const [fullImageUri, setFullImageUri] = useState<string | null>(null);
  const [isRolePickerOpen, setIsRolePickerOpen] = useState(true);
  const [roleNotice, setRoleNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [editingPosition, setEditingPosition] = useState('');

  if (!targetUser) return null;

  const stats = userStats(targetUser.id);
  const isMe = currentUser?.id === targetUser.id;
  const callerIsAppAdmin = isAppAdmin(currentUser);
  const callerIsDistrictAdmin = isDistrictAdmin(currentUser);
  const canManageRoles = callerIsAppAdmin || callerIsDistrictAdmin;

  const currentSysRole = getSystemRole(targetUser);
  const currentClubRole = getClubRole(targetUser);
  const currentPos = targetUser.position || 'Member';

  const appAdminCount = users.filter(u => isAppAdmin(u)).length;

  const handleUpdateSystemRole = (sysRole: SystemRole) => {
    if (!callerIsAppAdmin) return;
    if (currentSysRole === 'APP_ADMIN' && sysRole !== 'APP_ADMIN' && appAdminCount <= 1) {
      setRoleNotice({
        text: 'This is the last App Admin. Assign App Admin to someone else first.',
        error: true,
      });
      return;
    }

    updateUserRole(targetUser.id, { system_role: sysRole }, currentUser ?? undefined);
    setRoleNotice({
      text: `${targetUser.full_name}'s system role is now ${SYSTEM_ROLE_LABELS[sysRole]}.`,
      error: false,
    });
  };

  const handleUpdateClubRole = (clubRole: ClubRole, posName?: string) => {
    if (!canManageRoles) return;
    const finalPos = posName ?? (clubRole === 'CLUB_PRESIDENT' ? 'President' : clubRole === 'OFFICER' ? 'Officer' : 'Member');
    updateUserRole(targetUser.id, { club_role: clubRole, position: finalPos }, currentUser ?? undefined);
    setRoleNotice({
      text: `${targetUser.full_name}'s club role is now ${CLUB_ROLE_LABELS[clubRole]} (${finalPos}).`,
      error: false,
    });
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg }]} activeOpacity={1} onPress={e => e.stopPropagation()}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollInner}
              style={{ width: '100%' }}
            >
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
              <Text style={[styles.positionText, { color: colors.textMuted }]}>{positionRoleLabel(targetUser.position, targetUser)}</Text>

              {/* Role Governance & Permissions Panel */}
              {canManageRoles && (
                <View style={styles.adminRoleSection}>
                  <TouchableOpacity
                    style={[styles.adminRoleBtn, { borderColor: colors.primary + '3D', backgroundColor: colors.primary + '0D' }]}
                    onPress={() => setIsRolePickerOpen(!isRolePickerOpen)}
                  >
                    <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                    <Text style={[styles.adminRoleBtnText, { color: colors.primary }]}>
                      Manage Roles: {positionRoleLabel(targetUser.position, targetUser)}
                    </Text>
                    <Ionicons name={isRolePickerOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
                  </TouchableOpacity>

                  {isRolePickerOpen && (
                    <View style={[styles.roleMenu, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      {/* SECTION 1: System / District Access */}
                      {callerIsAppAdmin && (
                        <View style={styles.roleSectionBox}>
                          <Text style={[styles.roleSectionTitle, { color: colors.textMuted }]}>
                            🔑 SYSTEM & DISTRICT ACCESS
                          </Text>
                          <View style={styles.roleOptionsGrid}>
                            {(['NONE', 'DISTRICT_ADMIN', 'APP_ADMIN'] as SystemRole[]).map(sys => {
                              const isSelected = currentSysRole === sys;
                              return (
                                <TouchableOpacity
                                  key={sys}
                                  style={[
                                    styles.rolePillBtn,
                                    {
                                      borderColor: isSelected ? colors.primary : colors.border,
                                      backgroundColor: isSelected ? colors.primary + '1A' : 'transparent',
                                    },
                                  ]}
                                  onPress={() => handleUpdateSystemRole(sys)}
                                >
                                  {sys === 'APP_ADMIN' ? (
                                    <Ionicons name="key" size={12} color={isSelected ? colors.primary : colors.textMuted} />
                                  ) : sys === 'DISTRICT_ADMIN' ? (
                                    <Ionicons name="settings" size={12} color={isSelected ? colors.primary : colors.textMuted} />
                                  ) : (
                                    <Ionicons name="person" size={12} color={isSelected ? colors.primary : colors.textMuted} />
                                  )}
                                  <Text
                                    style={[
                                      styles.rolePillText,
                                      {
                                        color: isSelected ? colors.primary : colors.text,
                                        fontWeight: isSelected ? '800' : '600',
                                      },
                                    ]}
                                  >
                                    {SYSTEM_ROLE_LABELS[sys]}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {/* SECTION 2: Club Role & Leadership Position */}
                      <View style={[styles.roleSectionBox, { marginTop: callerIsAppAdmin ? 8 : 0 }]}>
                        <Text style={[styles.roleSectionTitle, { color: colors.textMuted }]}>
                          ⭐ CLUB LEADERSHIP & POSITION
                        </Text>
                        <View style={styles.roleOptionsGrid}>
                          {(['MEMBER', 'OFFICER', 'CLUB_PRESIDENT'] as ClubRole[]).map(cRole => {
                            const isSelected = currentClubRole === cRole;
                            return (
                              <TouchableOpacity
                                key={cRole}
                                style={[
                                  styles.rolePillBtn,
                                  {
                                    borderColor: isSelected ? colors.primary : colors.border,
                                    backgroundColor: isSelected ? colors.primary + '1A' : 'transparent',
                                  },
                                ]}
                                onPress={() => handleUpdateClubRole(cRole)}
                              >
                                {cRole === 'CLUB_PRESIDENT' ? (
                                  <Ionicons name="star" size={12} color={isSelected ? colors.primary : colors.textMuted} />
                                ) : cRole === 'OFFICER' ? (
                                  <Ionicons name="ribbon" size={12} color={isSelected ? colors.primary : colors.textMuted} />
                                ) : (
                                  <Ionicons name="person" size={12} color={isSelected ? colors.primary : colors.textMuted} />
                                )}
                                <Text
                                  style={[
                                    styles.rolePillText,
                                    {
                                      color: isSelected ? colors.primary : colors.text,
                                      fontWeight: isSelected ? '800' : '600',
                                    },
                                  ]}
                                >
                                  {CLUB_ROLE_LABELS[cRole]}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Presets for Officers & Positions */}
                        <Text style={[styles.roleSectionTitle, { color: colors.textMuted, marginTop: 4 }]}>
                          Quick Position Presets:
                        </Text>
                        <View style={styles.positionPresetsRow}>
                          {ROTARACT_POSITIONS.map(pName => {
                            const isCurrent = currentPos.toLowerCase() === pName.toLowerCase();
                            return (
                              <TouchableOpacity
                                key={pName}
                                style={[
                                  styles.presetPill,
                                  {
                                    borderColor: isCurrent ? colors.primary : colors.border,
                                    backgroundColor: isCurrent ? colors.primary + '1A' : 'transparent',
                                  },
                                ]}
                                onPress={() => {
                                  const targetClubRole: ClubRole = getPositionClubRole(pName);
                                  handleUpdateClubRole(targetClubRole, pName);
                                }}
                              >
                                <Text
                                  style={[
                                    styles.presetText,
                                    {
                                      color: isCurrent ? colors.primary : colors.textMuted,
                                      fontWeight: isCurrent ? '800' : '500',
                                    },
                                  ]}
                                >
                                  {pName}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* Feedback notice */}
                      {roleNotice && (
                        <Text
                          style={[
                            styles.roleNotice,
                            { color: roleNotice.error ? colors.danger : colors.success ?? '#10B981' },
                          ]}
                        >
                          {roleNotice.text}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {/* Direct Contact Card */}
              {(() => {
                const isTargetClubPresident = getClubRole(targetUser) === 'CLUB_PRESIDENT';
                const isTargetAppAdmin = isAppAdmin(targetUser);
                const isTargetDistrictAdmin = isDistrictAdmin(targetUser);
                const isTargetLeadership = isTargetClubPresident || isTargetAppAdmin || isTargetDistrictAdmin;

                const isCallerPresident = getClubRole(currentUser) === 'CLUB_PRESIDENT';
                const isCallerLeadership = callerIsAppAdmin || callerIsDistrictAdmin || isCallerPresident;

                const isClubMate = !!(
                  currentUser?.club_id &&
                  targetUser.club_id &&
                  currentUser.club_id === targetUser.club_id
                );

                const canSeeContact = isMe || isClubMate || isTargetLeadership || isCallerLeadership;

                if (canSeeContact) {
                  return (
                    <View style={[styles.contactBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {targetUser.email ? (
                        <View style={styles.contactRow}>
                          <Ionicons name="mail-outline" size={14} color={colors.primary} />
                          <Text style={[styles.contactText, { color: colors.text }]} numberOfLines={1}>{targetUser.email}</Text>
                        </View>
                      ) : null}
                      {targetUser.contact_number ? (
                        <View style={styles.contactRow}>
                          <Ionicons name="call-outline" size={14} color={colors.primary} />
                          <Text style={[styles.contactText, { color: colors.text }]}>{targetUser.contact_number}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                }

                return (
                  <View style={[styles.contactProtectedBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
                    <Text style={[styles.contactProtectedText, { color: colors.textMuted }]}>
                      Contact details visible to clubmates and leadership
                    </Text>
                  </View>
                );
              })()}

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

              {/* Direct Action Button(s) */}
              {!isMe && onStartChat && !inquiriesBlocked && (
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
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Full image viewer overlay */}
        <FullImageModal
          presentation="overlay"
          visible={!!fullImageUri}
          imageUri={fullImageUri}
          title={`${targetUser.full_name}'s Profile Photo`}
          onClose={() => setFullImageUri(null)}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', borderRadius: 20, padding: 24, alignItems: 'center', position: 'relative', maxHeight: '90%' },
  scrollInner: { alignItems: 'center', width: '100%', paddingBottom: 16 },
  closeBtn: { position: 'absolute', top: 16, right: 16, padding: 4, zIndex: 10 },
  avatarWrap: { marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  clubText: { fontSize: 13, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  positionText: { fontSize: 12, marginTop: 2, textAlign: 'center' },
  contactBox: { width: '100%', borderRadius: 10, borderWidth: 1, padding: 10, gap: 6, marginTop: 12 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactText: { fontSize: 12, fontWeight: '600' },
  contactProtectedBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 12 },
  contactProtectedText: { fontSize: 11, fontStyle: 'italic' },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  statBox: { alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 11, marginTop: 2 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 12, borderRadius: 12, marginTop: 18 },
  chatBtnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  chatChoiceGroup: { width: '100%', gap: 8, marginTop: 18 },
  chatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  adminRoleSection: { width: '100%', marginTop: 14 },
  adminRoleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  adminRoleBtnText: { fontSize: 12, fontWeight: '700', flex: 1, marginHorizontal: 6 },
  roleMenu: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    width: '100%',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  roleSectionBox: { width: '100%', gap: 8 },
  roleSectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  roleOptionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rolePillBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  rolePillText: { fontSize: 12 },
  positionPresetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  presetPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  presetText: { fontSize: 11, fontWeight: '600' },
  roleNotice: { fontSize: 11, fontWeight: '700', color: '#10B981', marginTop: 6, textAlign: 'center' },
});
