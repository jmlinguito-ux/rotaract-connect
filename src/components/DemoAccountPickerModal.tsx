import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { AppUser } from '../types';
import UserAvatar from './UserAvatar';
import VerifiedCheck from './VerifiedCheck';
import RoleBadgeIcon from './RoleBadgeIcon';
import { ROLE_BADGES } from '../utils/roles';

interface DemoAccountPickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export function DemoAccountPickerModal({ visible, onClose }: DemoAccountPickerModalProps) {
  const { user: currentUser, demoUsers, signInAs } = useAuth();

  const handleSelectUser = (u: AppUser) => {
    signInAs(u.id);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={e => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>Switch Demo Account</Text>
                <Text style={styles.sub}>Test roles, clubs & verification permissions</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={demoUsers}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const isSelected = currentUser?.id === item.id;
              const roleBadge = ROLE_BADGES[item.role];

              return (
                <TouchableOpacity
                  style={[styles.accountCard, isSelected && styles.accountCardActive]}
                  onPress={() => handleSelectUser(item)}
                >
                  <UserAvatar user={item} size={40} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.name, isSelected && styles.nameActive]}>{item.full_name}</Text>
                      <VerifiedCheck user={item} size={14} />
                      {roleBadge ? (
                        <View style={[styles.roleChip, { backgroundColor: roleBadge.color + '1F', borderColor: roleBadge.color }]}>
                          <RoleBadgeIcon badge={roleBadge} size={9} />
                          <Text style={[styles.roleChipText, { color: roleBadge.color }]}>{roleBadge.label}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.meta}>
                      {item.position} • {item.club_name}
                    </Text>
                  </View>

                  {isSelected ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  closeBtn: { padding: 4 },
  list: { gap: 8, paddingBottom: 10 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardBg },
  accountCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '0D' },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  roleChipText: { fontSize: 9, fontWeight: '800' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  avatarActive: { backgroundColor: colors.primary },
  avatarText: { fontSize: 14, fontWeight: '800', color: colors.text },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  nameActive: { color: colors.primary, fontWeight: '800' },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  roleBadgePres: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  roleBadgePresText: { fontSize: 10, fontWeight: '800', color: '#B45309' },
  roleBadgeAdmin: { backgroundColor: '#E0E7FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  roleBadgeAdminText: { fontSize: 10, fontWeight: '800', color: '#3730A3' },
});
