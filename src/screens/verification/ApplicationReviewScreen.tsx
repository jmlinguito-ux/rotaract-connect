import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform, Keyboard, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { BottomSheet } from '../../components/BottomSheet';
import FullImageModal from '../../components/FullImageModal';
import UserAvatar from '../../components/UserAvatar';

type Props = NativeStackScreenProps<RootStackParamList, 'ApplicationReview'>;

const POSITIONS = ['President', 'Officer', 'Member'];

export default function ApplicationReviewScreen({ route, navigation }: Props) {
  const { applicationId } = route.params;
  const { user } = useAuth();
  const { applications, reviewApplication, resubmitApplication, clubs } = useData();
  const { colors: themeColors } = useTheme();

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [proofModalUri, setProofModalUri] = useState<string | null>(null);

  // Re-apply State
  const [reapplyModalVisible, setReapplyModalVisible] = useState(false);
  const [isClubDropdownOpen, setIsClubDropdownOpen] = useState(false);
  const [isPositionDropdownOpen, setIsPositionDropdownOpen] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const app = applications.find(a => a.id === applicationId);

  const [editMemberId, setEditMemberId] = useState(app?.member_id || '');
  const [editClubId, setEditClubId] = useState(app?.club_id || '');
  const [editClubName, setEditClubName] = useState(app?.club_name || '');
  const [editPosition, setEditPosition] = useState(app?.position || 'Member');

  useEffect(() => {
    if (app) {
      setEditMemberId(app.member_id || '');
      setEditClubId(app.club_id || '');
      setEditClubName(app.club_name || '');
      setEditPosition(app.position || 'Member');
    }
  }, [app?.member_id, app?.club_id, app?.club_name, app?.position]);

  if (!app || !user) return <Text style={{ padding: 20, color: themeColors.text }}>Application not found.</Text>;

  const isPresidentApp = app.position.toLowerCase().includes('president');
  const canClubValidate = user.role === 'CLUB_PRESIDENT' && app.club_id === user.club_id && !isPresidentApp && app.status === 'AWAITING_CLUB_VALIDATION';
  const canDistrict = user.role === 'DISTRICT_ADMIN' && isPresidentApp && ['AWAITING_DISTRICT_VALIDATION', 'AWAITING_CLUB_VALIDATION'].includes(app.status);
  // The App Administrator is the final step — they only act after the club validated,
  // not on applications still waiting for a Club President.
  const canAdmin = user.role === 'APP_ADMIN' && app.status === 'AWAITING_ADMIN_VERIFICATION';

  const canReview = canClubValidate || canDistrict || canAdmin;

  const handleApprove = () => {
    const approveAction = canClubValidate
      ? 'CLUB_VALIDATE'
      : canDistrict
      ? 'DISTRICT_APPROVE'
      : 'ADMIN_APPROVE';

    const isClubStep = approveAction === 'CLUB_VALIDATE';
    Alert.alert(
      'Approve Application',
      `Are you sure you want to approve ${app.full_name} as ${app.position} of ${app.club_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: () => {
            reviewApplication(app.id, approveAction, user, '');
            Alert.alert(
              isClubStep ? 'Validated & Forwarded' : 'Application Approved',
              isClubStep
                ? `${app.full_name}'s application was validated and sent to the App Administrator for final verification.`
                : `The application for ${app.full_name} was approved.`,
              [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          },
        },
      ],
    );
  };

  const handleOpenRejectModal = () => {
    setRejectReason('');
    setRejectModalVisible(true);
  };

  const handleConfirmReject = () => {
    reviewApplication(app.id, 'REJECT', user, rejectReason.trim());
    setRejectModalVisible(false);
    Alert.alert('Application Rejected', `The application for ${app.full_name} has been rejected.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.header, { backgroundColor: themeColors.primary + '1A' }]}>
          <UserAvatar user={{ full_name: app.full_name }} size={72} style={{ marginBottom: 10 }} />
          <Text style={[styles.name, { color: themeColors.text }]}>{app.full_name}</Text>
          <Text style={[styles.email, { color: themeColors.textMuted }]}>{app.email}</Text>
          <View style={[
            styles.statusBadge,
            {
              backgroundColor: app.status === 'VERIFIED' ? themeColors.primary + '1F' : app.status === 'REJECTED' ? themeColors.danger + '1F' : '#6B72801F',
              borderColor: app.status === 'VERIFIED' ? themeColors.primary : app.status === 'REJECTED' ? themeColors.danger : '#6B7280',
            },
          ]}>
            <Text style={[
              styles.statusText,
              { color: app.status === 'VERIFIED' ? themeColors.primary : app.status === 'REJECTED' ? themeColors.danger : '#6B7280' },
            ]}>
              {app.status === 'VERIFIED' ? 'VERIFIED' : app.status === 'REJECTED' ? 'REJECTED' : 'UNVERIFIED'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>Rotaract Info</Text>
          <InfoRow label="Club" value={app.club_name} colors={themeColors} />
          <InfoRow label="Member ID" value={app.member_id} colors={themeColors} />
          <InfoRow label="Position" value={app.position} colors={themeColors} />
          <InfoRow label="Submitted" value={new Date(app.submitted_at).toLocaleString()} colors={themeColors} />
        </View>

        {app.proof_url ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>Verification Proof / ID Photo</Text>
            <TouchableOpacity
              activeOpacity={0.9}
              style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: themeColors.border, height: 180 }}
              onPress={() => setProofModalUri(app.proof_url!)}
            >
              <Image source={{ uri: app.proof_url }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
              <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="expand-outline" size={12} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Tap for Full Resolution</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : null}

        {user.role === 'DISTRICT_ADMIN' && !isPresidentApp && (
          <View style={[styles.infoBanner, { backgroundColor: themeColors.warning + '1A', borderColor: themeColors.warning + '3D' }]}>
            <Ionicons name="information-circle" size={20} color={themeColors.warning} />
            <Text style={[styles.infoBannerText, { color: themeColors.text }]}>
              District Administrators only review Club President applications. Member validations are handled by the Club President.
            </Text>
          </View>
        )}

        {app.status === 'REJECTED' && app.user_id === user.id && app.notes ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.danger }]}>Reason for Rejection</Text>
            <Text style={[styles.notes, { color: themeColors.text }]}>{app.notes}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer Action Buttons limited strictly to Approve and Reject */}
      {canReview && (
        <View style={[styles.footer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColors.success }]}
            onPress={handleApprove}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.actionText}>Approve</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColors.danger }]}
            onPress={handleOpenRejectModal}
          >
            <Ionicons name="close-circle" size={18} color="#fff" />
            <Text style={styles.actionText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Re-apply Button for Rejected Applicants */}
      {app.status === 'REJECTED' && app.user_id === user.id && (
        <View style={[styles.footer, { backgroundColor: themeColors.cardBg, borderTopColor: themeColors.border }]}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: themeColors.primary, flex: 1 }]}
            onPress={() => setReapplyModalVisible(true)}
          >
            <Ionicons name="refresh-outline" size={18} color="#fff" />
            <Text style={styles.actionText}>Edit & Resubmit Application</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reject Confirmation & Reason Centered Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={[
              styles.modalBackdropPress,
              {
                justifyContent: isKeyboardVisible ? 'flex-end' : 'center',
                paddingBottom: isKeyboardVisible ? 24 : 20,
              },
            ]}
            activeOpacity={1}
            onPress={() => setRejectModalVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={[
                styles.modalCard,
                { backgroundColor: themeColors.cardBg, borderColor: themeColors.border },
              ]}
              onPress={e => e.stopPropagation()}
            >
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="alert-circle" size={22} color={themeColors.danger} />
                  <Text style={[styles.modalTitle, { color: themeColors.text }]}>Reject Application</Text>
                </View>
                <TouchableOpacity onPress={() => setRejectModalVisible(false)}>
                  <Ionicons name="close" size={22} color={themeColors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalSub, { color: themeColors.text }]}>
                Are you sure you want to reject {app.full_name}'s application? Please provide a reason below.
              </Text>

              <TextInput
                style={[
                  styles.modalInput,
                  { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border },
                ]}
                placeholder="Reason for rejection (optional)..."
                placeholderTextColor={themeColors.textMuted}
                value={rejectReason}
                onChangeText={setRejectReason}
                multiline
              />

              <View style={styles.modalFooterRow}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
                  onPress={() => setRejectModalVisible(false)}
                >
                  <Text style={[styles.modalCancelBtnText, { color: themeColors.text }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalRejectBtn, { backgroundColor: themeColors.danger }]}
                  onPress={handleConfirmReject}
                >
                  <Text style={styles.modalRejectBtnText}>Confirm Rejection</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Re-apply & Edit Application BottomSheet */}
      <BottomSheet
        visible={reapplyModalVisible}
        onClose={() => {
          setReapplyModalVisible(false);
          setIsClubDropdownOpen(false);
          setIsPositionDropdownOpen(false);
        }}
        cardStyle={[styles.modalCardContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
      >
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: themeColors.text }]}>Resubmit Application</Text>
          <TouchableOpacity onPress={() => setReapplyModalVisible(false)}>
            <Ionicons name="close" size={24} color={themeColors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={{ marginBottom: 16 }}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Rotaract Club Selector */}
          <View style={{ zIndex: isClubDropdownOpen ? 1100 : 1, position: 'relative' }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Rotaract Club *</Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
              onPress={() => {
                setIsClubDropdownOpen(!isClubDropdownOpen);
                setIsPositionDropdownOpen(false);
              }}
            >
              <Text style={editClubName ? [styles.selectorText, { color: themeColors.text }] : [styles.selectorPlaceholder, { color: themeColors.textMuted }]}>
                {editClubName || 'Select Rotaract Club'}
              </Text>
              <Ionicons name={isClubDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={themeColors.textMuted} />
            </TouchableOpacity>

            {isClubDropdownOpen && (
              <View style={[styles.overlayDropdownMenu, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border, maxHeight: 220 }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {clubs.map(c => {
                    const isSelected = editClubId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.overlayDropdownItem}
                        onPress={() => {
                          setEditClubId(c.id);
                          setEditClubName(c.club_name);
                          setIsClubDropdownOpen(false);
                        }}
                      >
                        <View style={styles.checkmarkWrap}>
                          {isSelected && <Ionicons name="checkmark-sharp" size={18} color={themeColors.text} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.overlayDropdownText, { color: themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{c.club_name}</Text>
                          <Text style={{ fontSize: 11, color: themeColors.textMuted }}>{c.city}, {c.province}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Member ID */}
          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Member ID (8 digits)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.bg, color: themeColors.text, borderColor: themeColors.border }]}
            value={editMemberId}
            onChangeText={(t) => setEditMemberId(t.replace(/[^0-9]/g, '').slice(0, 8))}
            placeholder="10482910"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="numeric"
            maxLength={8}
          />
          {editMemberId.length > 0 && editMemberId.length < 8 ? (
            <Text style={{ fontSize: 12, color: themeColors.danger, marginTop: 4 }}>Rotaract Member ID must be 8 digits</Text>
          ) : null}

          {/* Position Selector */}
          <View style={{ zIndex: isPositionDropdownOpen ? 1000 : 1, position: 'relative' }}>
            <Text style={[styles.inputLabel, { color: themeColors.text }]}>Position *</Text>
            <TouchableOpacity
              style={[styles.selector, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
              onPress={() => {
                setIsPositionDropdownOpen(!isPositionDropdownOpen);
                setIsClubDropdownOpen(false);
              }}
            >
              <Text style={editPosition ? [styles.selectorText, { color: themeColors.text }] : [styles.selectorPlaceholder, { color: themeColors.textMuted }]}>
                {editPosition || 'Select Position'}
              </Text>
              <Ionicons name={isPositionDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color={themeColors.textMuted} />
            </TouchableOpacity>

            {isPositionDropdownOpen && (
              <View style={[styles.overlayDropdownMenuUp, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border, maxHeight: 220 }]}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                  {POSITIONS.map(pos => {
                    const isSelected = editPosition === pos;
                    return (
                      <TouchableOpacity
                        key={pos}
                        style={styles.overlayDropdownItem}
                        onPress={() => {
                          setEditPosition(pos);
                          setIsPositionDropdownOpen(false);
                        }}
                      >
                        <View style={styles.checkmarkWrap}>
                          {isSelected && <Ionicons name="checkmark-sharp" size={18} color={themeColors.text} />}
                        </View>
                        <Text style={[styles.overlayDropdownText, { color: themeColors.text, fontWeight: isSelected ? '700' : '400' }]}>{pos}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={[styles.reviewNoteBox, { backgroundColor: themeColors.primary + '14', borderColor: themeColors.primary + '3D' }]}>
            <Ionicons name="information-circle-outline" size={18} color={themeColors.primary} />
            <Text style={[styles.reviewNoteText, { color: themeColors.text }]}>
              {editPosition.toLowerCase().includes('president')
                ? 'Your updated application will be reviewed by an Administrator.'
                : 'Your updated application will be reviewed by the Club President.'}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.modalFooterRow}>
          <TouchableOpacity
            style={[styles.modalCancelBtn, { borderColor: themeColors.border }]}
            onPress={() => setReapplyModalVisible(false)}
          >
            <Text style={[styles.modalCancelBtnText, { color: themeColors.text }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalRejectBtn,
              { backgroundColor: themeColors.primary, opacity: editMemberId.length === 8 && editClubId ? 1 : 0.5 },
            ]}
            disabled={editMemberId.length !== 8 || !editClubId}
            onPress={() => {
              resubmitApplication(app.id, {
                member_id: editMemberId,
                club_id: editClubId,
                club_name: editClubName,
                position: editPosition,
              });
              setReapplyModalVisible(false);
              Alert.alert('Application Resubmitted', 'Your updated application has been resubmitted for verification.');
            }}
          >
            <Text style={styles.modalRejectBtnText}>Resubmit</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function InfoRow({ label, value, colors: c }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
      <Text style={[styles.infoLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { alignItems: 'center', padding: 24 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 22 },
  name: { fontSize: 20, fontWeight: '800' },
  email: { fontSize: 13, marginTop: 4 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginTop: 10, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  section: { padding: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '600' },
  notes: { fontSize: 14, fontStyle: 'italic' },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoBannerText: { flex: 1, fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Centered Modal styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalBackdropPress: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 20, paddingBottom: 24 },
  modalCard: { width: '100%', borderRadius: 20, padding: 20, borderWidth: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalSub: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  modalInput: { borderWidth: 1, borderRadius: 12, padding: 12, height: 90, textAlignVertical: 'top', fontSize: 14, marginBottom: 16 },
  modalFooterRow: { flexDirection: 'row', gap: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  modalCancelBtnText: { fontSize: 14, fontWeight: '700' },
  modalRejectBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  modalRejectBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  inputLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  selector: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  selectorText: { fontSize: 14, fontWeight: '600' },
  selectorPlaceholder: { fontSize: 14 },
  overlayDropdownMenu: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  overlayDropdownMenuUp: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 6,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  overlayDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  overlayDropdownText: { fontSize: 14 },
  checkmarkWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewNoteBox: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginTop: 14, alignItems: 'center' },
  reviewNoteText: { flex: 1, fontSize: 12, lineHeight: 16 },
  modalCardContainer: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, maxHeight: '85%' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  pickerModalCard: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, borderWidth: 1 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, borderWidth: 1 },
  pickerItemText: { fontSize: 14 },
});
