import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { AppUser } from '../../types';
import RotaryWheel from '../../components/RotaryWheel';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

const ROLE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  MEMBER: 'person',
  CLUB_PRESIDENT: 'ribbon',
  DISTRICT_ADMIN: 'shield-checkmark',
  APP_ADMIN: 'settings',
};

const ROLE_COLOR: Record<string, string> = {
  MEMBER: colors.primary,
  CLUB_PRESIDENT: '#B45309',
  DISTRICT_ADMIN: colors.info,
  APP_ADMIN: '#6D28D9',
};

export default function LoginScreen({ navigation }: Props) {
  const { signInAs, demoUsers } = useAuth();
  const [selectedDemoUser, setSelectedDemoUser] = useState<AppUser>(demoUsers[0]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSignIn = () => {
    if (selectedDemoUser) {
      signInAs(selectedDemoUser.id);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoWrap}>
            <RotaryWheel size={84} color={colors.primary} style={styles.logo} />
            <Text style={styles.title}>Rotaract Connect</Text>
            <Text style={styles.subtitle}>District 3800 • Verified Rotaractor Network</Text>
          </View>

          <View style={styles.demoBanner}>
            <Ionicons name="flask" size={14} color={colors.info} />
            <Text style={styles.demoBannerText}>Demo Mode — Select an account from the dropdown</Text>
          </View>

          {/* Selected Account Dropdown Box */}
          <Text style={styles.fieldLabel}>Select Demo Account</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            onPress={() => setDropdownOpen(true)}
            activeOpacity={0.8}
          >
            <View style={[styles.roleIcon, { backgroundColor: (ROLE_COLOR[selectedDemoUser.role] || colors.primary) + '15' }]}>
              <Ionicons
                name={ROLE_ICON[selectedDemoUser.role] || 'person'}
                size={22}
                color={ROLE_COLOR[selectedDemoUser.role] || colors.primary}
              />
            </View>

            <View style={{ flex: 1 }}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.roleName}>{selectedDemoUser.full_name}</Text>
                <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLOR[selectedDemoUser.role] || colors.primary) + '15' }]}>
                  <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[selectedDemoUser.role] || colors.primary }]}>
                    {selectedDemoUser.role.replace(/_/g, ' ')}
                  </Text>
                </View>
              </View>
              <Text style={styles.positionText}>
                {selectedDemoUser.position} • <Text style={styles.clubNameText}>{selectedDemoUser.club_name}</Text>
              </Text>
            </View>

            <Ionicons name="chevron-down" size={20} color={colors.primary} />
          </TouchableOpacity>

          {/* Sign In Action Button */}
          <TouchableOpacity style={styles.signInBtn} onPress={handleSignIn} activeOpacity={0.8}>
            <Ionicons name="log-in-outline" size={20} color="#fff" />
            <Text style={styles.signInBtnText}>Sign In as {selectedDemoUser.full_name.split(' ')[0]}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkBtn}>
            <Text style={styles.linkText}>New Rotaractor? <Text style={styles.linkTextBold}>Create an account</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Account Selector Dropdown Modal */}
      <Modal visible={dropdownOpen} transparent animationType="fade" onRequestClose={() => setDropdownOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setDropdownOpen(false)}>
          <TouchableOpacity style={styles.dropdownModalCard} activeOpacity={1} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <Ionicons name="people-circle" size={22} color={colors.primary} />
                <Text style={styles.modalTitle}>Choose Demo Account</Text>
              </View>
              <TouchableOpacity onPress={() => setDropdownOpen(false)}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={demoUsers}
              keyExtractor={u => u.id}
              contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
              renderItem={({ item: u }) => {
                const isSelected = selectedDemoUser.id === u.id;
                return (
                  <TouchableOpacity
                    style={[styles.dropdownItemCard, isSelected && styles.dropdownItemCardActive]}
                    onPress={() => {
                      setSelectedDemoUser(u);
                      setDropdownOpen(false);
                    }}
                  >
                    <View style={[styles.roleIcon, { backgroundColor: (ROLE_COLOR[u.role] || colors.primary) + '15' }]}>
                      <Ionicons name={ROLE_ICON[u.role] || 'person'} size={20} color={ROLE_COLOR[u.role] || colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={[styles.roleName, isSelected && { color: colors.primary }]}>{u.full_name}</Text>
                        <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLOR[u.role] || colors.primary) + '15' }]}>
                          <Text style={[styles.roleBadgeText, { color: ROLE_COLOR[u.role] || colors.primary }]}>
                            {u.role.replace(/_/g, ' ')}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.positionText}>
                        {u.position} • {u.club_name}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },
  logoWrap: { alignItems: 'center', marginTop: 12, marginBottom: 20 },
  logo: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EBF5FF', padding: 10, borderRadius: 10, marginBottom: 20, justifyContent: 'center' },
  demoBannerText: { fontSize: 12, color: colors.info, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, marginBottom: 8 },
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: '#fff', marginBottom: 16 },
  roleIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  roleName: { fontSize: 15, fontWeight: '800', color: colors.text },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  positionText: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  clubNameText: { fontWeight: '600', color: colors.text },
  signInBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14, marginTop: 6 },
  signInBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  linkBtn: { marginTop: 20, alignItems: 'center' },
  linkText: { color: colors.textMuted, fontSize: 14 },
  linkTextBold: { color: colors.primary, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dropdownModalCard: { width: '100%', maxHeight: '75%', backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  dropdownItemCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dropdownItemCardActive: { borderColor: colors.primary, backgroundColor: colors.primary + '0D' },
});
