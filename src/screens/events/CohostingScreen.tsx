import React, { useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Image, Alert, Modal, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import ZoomableImageModal from '../../components/ZoomableImageModal';
import { EventCohost } from '../../types';
import { uploadImageAsset, getSignedImageUrl } from '../../services/storage';
import { getClubRole } from '../../utils/roles';
import { useKeyboardOffset } from '../../components/keyboard/useKeyboardOffset';

type Props = NativeStackScreenProps<RootStackParamList, 'Cohosting'>;

/**
 * The single screen where cohosting lives.
 *
 * Organizers see: the roster with approve/reject controls, payment verification,
 * and a financial summary tile.
 * Cohosting club leadership sees: their own row with Pay / Cancel controls.
 * Everyone else sees: the roster, read-only.
 */
export default function CohostingScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { user } = useAuth();
  const { colors: themeColors } = useTheme();
  const {
    events, clubs, cohosts,
    requestCohost, reviewCohost, verifyCohostPayment, cancelCohost, submitCohostPayment,
  } = useData();

  const event = events.find(e => e.id === eventId);
  const eventCohosts = useMemo(
    () => cohosts.filter(c => c.event_id === eventId),
    [cohosts, eventId],
  );

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState<'REVIEW' | 'VERIFY' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [paymentRow, setPaymentRow] = useState<EventCohost | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [showRequestSheet, setShowRequestSheet] = useState(false);

  if (!event) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
        <Text style={[styles.empty, { color: themeColors.textMuted }]}>Event not found.</Text>
      </SafeAreaView>
    );
  }

  const canManage =
    !!user && (user.id === event.organizer_user_id
      || (event.co_organizer_user_ids ?? []).includes(user.id)
      || user.role === 'DISTRICT_ADMIN' || user.role === 'APP_ADMIN');

  const effectiveClubRole = getClubRole(user);

  // The rule is enforced server-side too; disabling the button avoids a wasted round-trip.
  const canRequest = !!user
    && user.club_id
    && user.club_id !== event.organizing_club_id
    && event.cohosting_enabled
    && (effectiveClubRole === 'CLUB_PRESIDENT' || effectiveClubRole === 'OFFICER')
    && !eventCohosts.some(c => c.club_id === user.club_id && (c.status === 'REQUESTED' || c.status === 'APPROVED'));

  const myCohost = user?.club_id
    ? eventCohosts.find(c => c.club_id === user.club_id && c.status !== 'REJECTED' && c.status !== 'CANCELLED')
    : undefined;

  const totals = useMemo(() => {
    const approved = eventCohosts.filter(c => c.status === 'APPROVED');
    const expected = approved.reduce((sum, c) => sum + c.agreed_fee_centavos, 0);
    const collected = approved
      .filter(c => c.payment_status === 'VERIFIED')
      .reduce((sum, c) => sum + c.agreed_fee_centavos, 0);
    return {
      approvedCount: approved.length,
      pendingCount: eventCohosts.filter(c => c.status === 'REQUESTED').length,
      expectedPesos: Math.round(expected / 100),
      collectedPesos: Math.round(collected / 100),
    };
  }, [eventCohosts]);

  const doReview = async (action: 'APPROVE' | 'REJECT') => {
    if (!reviewingId) return;
    const id = reviewingId;
    setReviewingId(null); setReviewMode(null);
    const res = await reviewCohost(id, action, reviewNotes || undefined);
    setReviewNotes('');
    if (!res.ok) Alert.alert('Could not update request', res.error ?? 'Try again.');
  };

  const doVerify = async (action: 'VERIFY' | 'REJECT') => {
    if (!reviewingId) return;
    const id = reviewingId;
    setReviewingId(null); setReviewMode(null);
    const res = await verifyCohostPayment(id, action, reviewNotes || undefined);
    setReviewNotes('');
    if (!res.ok) Alert.alert('Could not update payment', res.error ?? 'Try again.');
  };

  const doCancel = async () => {
    if (!confirmCancelId) return;
    const id = confirmCancelId;
    setConfirmCancelId(null);
    const res = await cancelCohost(id);
    if (!res.ok) Alert.alert('Could not cancel', res.error ?? 'Try again.');
  };

  const doRequest = async () => {
    if (!user) return;
    const res = await requestCohost(eventId, 5);
    if (!res.ok) Alert.alert('Could not send request', res.error ?? 'Try again.');
  };

  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);

  const openReceipt = async (path: string, itemId: string) => {
    try {
      setReceiptLoadingId(itemId);
      let url = path;
      if (!path.startsWith('http://') && !path.startsWith('https://')) {
        url = await getSignedImageUrl('cohost-receipts', path);
      }
      setReceiptUrl(url);
    } catch (err: any) {
      Alert.alert('Could not open receipt', err?.message ?? 'Please try again.');
    } finally {
      setReceiptLoadingId(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={eventCohosts}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {/* Financial summary tile (organizer only). */}
            {canManage && (
              <View style={[styles.summary, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Text style={[styles.summaryTitle, { color: themeColors.primary }]}>Cohosting Overview</Text>
                <View style={styles.statRow}>
                  <Stat label="Approved" value={totals.approvedCount} color={themeColors.text} />
                  <Stat label="Pending" value={totals.pendingCount} color={themeColors.primary} />
                  <Stat label="Expected" value={`₱${totals.expectedPesos.toLocaleString()}`} color={themeColors.text} />
                  <Stat label="Collected" value={`₱${totals.collectedPesos.toLocaleString()}`} color="#059669" />
                </View>
              </View>
            )}

            {/* Cohosting-not-open notice. */}
            {!event.cohosting_enabled && (
              <View style={[styles.notice, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Text style={[styles.noticeText, { color: themeColors.textMuted }]}>
                  Cohosting is not enabled for this event.
                </Text>
              </View>
            )}

            {/* Request button for clubs that qualify. */}
            {canRequest && !myCohost && (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
                onPress={() => setShowRequestSheet(true)}
              >
                <Ionicons name="people-outline" size={16} color="#FFF" />
                <Text style={styles.primaryBtnText}>Become a Cohost</Text>
              </TouchableOpacity>
            )}

            {/* Explain why the button isn't available. */}
            {event.cohosting_enabled && !canRequest && !myCohost && user && (
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                {user.club_id === event.organizing_club_id
                  ? 'Your club is the organizing club.'
                  : (effectiveClubRole === 'CLUB_PRESIDENT' || effectiveClubRole === 'OFFICER')
                    ? ''
                    : 'Only your Club President or an Officer may request cohosting.'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: themeColors.textMuted }]}>
            No cohost requests yet.
          </Text>
        }
        renderItem={({ item }) => {
          const club = clubs.find(c => c.id === item.club_id);
          const feePesos = Math.round(item.agreed_fee_centavos / 100);
          const mine = user?.club_id === item.club_id;
          const paidLabel = paymentBadge(item.payment_status);
          const statusLabel = statusBadge(item.status);
          const canPay =
            mine
            && item.status === 'APPROVED'
            && (item.payment_status === 'NONE' || item.payment_status === 'REJECTED')
            && (effectiveClubRole === 'CLUB_PRESIDENT' || effectiveClubRole === 'OFFICER');

          return (
            <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.clubName, { color: themeColors.text }]} numberOfLines={1}>
                    {club?.club_name ?? 'Unknown club'}
                  </Text>
                  <Text style={[styles.meta, { color: themeColors.textMuted }]}>
                    Expected: {item.expected_participants} · Fee: {feePesos > 0 ? `₱${feePesos.toLocaleString()}` : 'Free'}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusLabel.bg }]}>
                  <Text style={[styles.badgeText, { color: statusLabel.color }]}>{statusLabel.text}</Text>
                </View>
              </View>

              {item.message && (
                <Text style={[styles.message, { color: themeColors.text }]} numberOfLines={3}>
                  “{item.message}”
                </Text>
              )}

              {item.status === 'APPROVED' && feePesos > 0 && (
                <View style={styles.paymentBox}>
                  <View style={[styles.badge, { backgroundColor: paidLabel.bg }]}>
                    <Text style={[styles.badgeText, { color: paidLabel.color }]}>{paidLabel.text}</Text>
                  </View>
                  {item.payment_method && (
                    <Text style={[styles.meta, { color: themeColors.textMuted, marginTop: 4 }]}>
                      Method: {item.payment_method}
                      {item.payment_reference ? ` · Ref ${item.payment_reference}` : ''}
                    </Text>
                  )}
                  {item.payment_receipt_path && (canManage || mine) && (
                    <TouchableOpacity
                      style={styles.viewReceiptRow}
                      onPress={() => openReceipt(item.payment_receipt_path!, item.id)}
                      activeOpacity={0.7}
                    >
                      {receiptLoadingId === item.id ? (
                        <ActivityIndicator size="small" color={themeColors.primary} />
                      ) : null}
                      <Text style={[styles.link, { color: themeColors.primary }]}>
                        {receiptLoadingId === item.id ? 'Loading receipt…' : 'View receipt'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {item.payment_review_notes && (
                    <Text style={[styles.meta, { color: themeColors.textMuted, marginTop: 4 }]}>
                      Notes: {item.payment_review_notes}
                    </Text>
                  )}
                </View>
              )}

              {/* Actions row */}
              <View style={styles.actions}>
                {canManage && item.status === 'REQUESTED' && (
                  <>
                    <ActionBtn
                      label="Reject"
                      onPress={() => { setReviewingId(item.id); setReviewMode('REVIEW'); setReviewNotes(''); }}
                      variant="ghost"
                    />
                    <ActionBtn
                      label="Approve"
                      onPress={async () => { const r = await reviewCohost(item.id, 'APPROVE'); if (!r.ok) Alert.alert('Approve failed', r.error ?? ''); }}
                      variant="primary"
                    />
                  </>
                )}
                {canManage && item.status === 'APPROVED' && item.payment_status === 'PENDING_VERIFICATION' && (
                  <>
                    <ActionBtn
                      label="Reject Payment"
                      onPress={() => { setReviewingId(item.id); setReviewMode('VERIFY'); setReviewNotes(''); }}
                      variant="ghost"
                    />
                    <ActionBtn
                      label="Verify Payment"
                      onPress={async () => { const r = await verifyCohostPayment(item.id, 'VERIFY'); if (!r.ok) Alert.alert('Verify failed', r.error ?? ''); }}
                      variant="primary"
                    />
                  </>
                )}
                {canPay && (
                  <ActionBtn label="Submit Payment" onPress={() => setPaymentRow(item)} variant="primary" />
                )}
                {(canManage || (mine && (effectiveClubRole === 'CLUB_PRESIDENT' || effectiveClubRole === 'OFFICER')))
                  && (item.status === 'REQUESTED' || item.status === 'APPROVED') && (
                  <ActionBtn label="Cancel" onPress={() => setConfirmCancelId(item.id)} variant="danger" />
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Review notes dialog — one for cohost-review, one for payment-verify. */}
      <ConfirmDialog
        visible={!!reviewingId && reviewMode === 'REVIEW'}
        title="Reject this cohost request?"
        message="Let the club leadership know why their request was rejected."
        confirmLabel="Reject request"
        destructive
        onConfirm={() => doReview('REJECT')}
        onClose={() => { setReviewingId(null); setReviewMode(null); setReviewNotes(''); }}
      />
      <ConfirmDialog
        visible={!!reviewingId && reviewMode === 'VERIFY'}
        title="Reject this payment?"
        message="Let the club know what to fix — wrong amount, unreadable receipt, etc."
        confirmLabel="Reject payment"
        destructive
        onConfirm={() => doVerify('REJECT')}
        onClose={() => { setReviewingId(null); setReviewMode(null); setReviewNotes(''); }}
      />
      <ConfirmDialog
        visible={!!confirmCancelId}
        title="Cancel this cohost?"
        message="The reserved slots will return to the general pool. Members who already registered keep their seats."
        confirmLabel="Cancel cohost"
        destructive
        onConfirm={doCancel}
        onClose={() => setConfirmCancelId(null)}
      />

      {/* Request to Cohost Sheet */}
      {showRequestSheet && event && (
        <RequestCohostSheet
          eventTitle={event.title}
          feeCentavos={event.cohosting_fee_centavos ?? 0}
          benefits={event.cohosting_benefits}
          onClose={() => setShowRequestSheet(false)}
          onSubmit={async (expectedCount, message) => {
            const res = await requestCohost(eventId, expectedCount, message);
            if (res.ok) {
              setShowRequestSheet(false);
              Alert.alert('Application Submitted', 'Your club’s cohost request was submitted to the organizers.');
            } else {
              Alert.alert('Could not send request', res.error ?? 'Try again.');
            }
          }}
        />
      )}

      {/* Payment submission sheet — kept inline to avoid a separate screen for MVP. */}
      {paymentRow && (
        <PaymentSheet
          row={paymentRow}
          clubId={user!.club_id}
          onClose={() => setPaymentRow(null)}
          onSubmit={async (method, reference, receiptPath) => {
            const res = await submitCohostPayment(paymentRow.id, method, reference, receiptPath);
            if (res.ok) setPaymentRow(null);
            else Alert.alert('Could not submit payment', res.error ?? 'Try again.');
          }}
        />
      )}

      {/* Receipt Preview Dialog Modal */}
      <Modal
        visible={!!receiptUrl && !isZooming}
        transparent
        animationType="fade"
        onRequestClose={() => setReceiptUrl(null)}
      >
        <View style={styles.receiptBackdrop}>
          <View style={[styles.receiptCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <View style={styles.receiptHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="receipt-outline" size={20} color={themeColors.primary} />
                <Text style={[styles.receiptTitle, { color: themeColors.text }]}>Uploaded Receipt</Text>
              </View>
              <TouchableOpacity
                onPress={() => setReceiptUrl(null)}
                style={[styles.receiptCloseBtn, { backgroundColor: themeColors.bg }]}
              >
                <Ionicons name="close" size={20} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.tapHint, { color: themeColors.textMuted }]}>
              Tap image to view in full resolution & zoom
            </Text>

            {/* Tap Image to Zoom */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setIsZooming(true)}
              style={[styles.receiptImageWrap, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}
            >
              {receiptUrl ? (
                <Image
                  source={{ uri: receiptUrl }}
                  style={styles.receiptImage}
                  resizeMode="contain"
                />
              ) : null}
              <View style={styles.zoomBadge}>
                <Ionicons name="expand" size={13} color="#FFF" />
                <Text style={styles.zoomBadgeText}>Tap to Zoom</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.receiptDoneBtn, { backgroundColor: themeColors.primary }]}
              onPress={() => setReceiptUrl(null)}
            >
              <Text style={styles.receiptDoneText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Full-resolution Zoom & Pan Modal */}
      <ZoomableImageModal
        visible={!!receiptUrl && isZooming}
        imageUri={receiptUrl}
        title="Uploaded Payment Receipt"
        onClose={() => setIsZooming(false)}
      />
    </SafeAreaView>
  );
}

// -------------------- helpers --------------------

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>{label}</Text>
    </View>
  );
}

function ActionBtn({
  label, onPress, variant,
}: { label: string; onPress: () => void; variant: 'primary' | 'ghost' | 'danger' }) {
  const { colors: themeColors } = useTheme();
  const bg = variant === 'primary' ? themeColors.primary : variant === 'danger' ? '#DC2626' : themeColors.surface;
  const fg = variant === 'ghost' ? themeColors.text : '#FFF';
  const border = variant === 'ghost' ? themeColors.border : bg;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.actionBtn, { backgroundColor: bg, borderColor: border }]}
    >
      <Text style={[styles.actionBtnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function statusBadge(s: EventCohost['status']) {
  switch (s) {
    case 'REQUESTED': return { text: 'Pending', bg: '#FEF3C7', color: '#92400E' };
    case 'APPROVED':  return { text: 'Approved', bg: '#D1FAE5', color: '#065F46' };
    case 'REJECTED':  return { text: 'Rejected', bg: '#FEE2E2', color: '#991B1B' };
    case 'CANCELLED': return { text: 'Cancelled', bg: '#E5E7EB', color: '#374151' };
  }
}

function paymentBadge(s: EventCohost['payment_status']) {
  switch (s) {
    case 'NONE': return { text: '🟡 Payment Due', bg: '#FEF3C7', color: '#92400E' };
    case 'PENDING_VERIFICATION': return { text: '🟡 Awaiting Verification', bg: '#FEF3C7', color: '#92400E' };
    case 'VERIFIED': return { text: '🟢 Paid', bg: '#D1FAE5', color: '#065F46' };
    case 'REJECTED': return { text: '🔴 Payment Rejected', bg: '#FEE2E2', color: '#991B1B' };
  }
}

// -------------------- payment submission sheet --------------------

/**
 * Inline sheet for the cohosting club to submit their payment.
 * MVP uses a receipt image + method + reference number. Full payment gateways
 * come later; this matches how Rotaract clubs already pay in practice.
 */
function PaymentSheet({
  row, clubId, onClose, onSubmit,
}: {
  row: EventCohost;
  clubId: string;
  onClose: () => void;
  onSubmit: (method: string, reference?: string, receiptPath?: string) => Promise<void>;
}) {
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const isKeyboardOpen = keyboardOffset > 0;

  const [method, setMethod] = useState<'GCASH' | 'MAYA' | 'BANK' | 'OTHER'>('GCASH');
  const [reference, setReference] = useState('');
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const feePesos = Math.round(row.agreed_fee_centavos / 100);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Photo access is required to upload a receipt.'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]) return;
    setUploading(true);
    try {
      // Path is scoped to the club's folder — see the RLS policy in migration 0043.
      const path = await uploadImageAsset('cohost-receipts', clubId, {
        uri: res.assets[0].uri,
        base64: res.assets[0].base64,
        mimeType: res.assets[0].mimeType,
      });
      setReceiptPath(path);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(method, reference || undefined, receiptPath ?? undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[
          styles.sheetOverlay,
          Platform.OS === 'android' && isKeyboardOpen ? { paddingBottom: keyboardOffset } : null,
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              paddingBottom: isKeyboardOpen && Platform.OS === 'android'
                ? 16
                : Math.max(insets.bottom + 16, 28),
              maxHeight: isKeyboardOpen ? '92%' : '85%',
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            <Text style={[styles.sheetTitle, { color: themeColors.text }]}>Submit Payment</Text>
            <Text style={[styles.meta, { color: themeColors.textMuted, marginBottom: 12 }]}>
              Amount due: ₱{feePesos.toLocaleString()}
            </Text>

            <Text style={[styles.label, { color: themeColors.text }]}>Method</Text>
            <View style={styles.chipRow}>
              {(['GCASH', 'MAYA', 'BANK', 'OTHER'] as const).map(m => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setMethod(m)}
                  style={[
                    styles.chip,
                    { backgroundColor: themeColors.bg, borderColor: themeColors.border },
                    method === m && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                  ]}
                >
                  <Text style={[styles.chipText, { color: method === m ? '#FFF' : themeColors.text }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.label, { color: themeColors.text }]}>Reference number (optional)</Text>
            <TextInput
              style={[
                {
                  backgroundColor: themeColors.bg,
                  borderColor: themeColors.border,
                  color: themeColors.text,
                  borderWidth: 1,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                },
                isInputFocused && { borderColor: themeColors.primary, borderWidth: 1.5 },
              ]}
              value={reference}
              onChangeText={setReference}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              placeholder="e.g. GCash ref 1234567"
              placeholderTextColor={themeColors.textMuted}
            />

            <TouchableOpacity
              onPress={pick}
              style={[styles.uploadBtn, { borderColor: themeColors.primary }]}
              disabled={uploading}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={themeColors.primary} />
              <Text style={[styles.uploadBtnText, { color: themeColors.primary }]}>
                {uploading ? 'Uploading…' : receiptPath ? 'Receipt uploaded ✓' : 'Upload receipt image'}
              </Text>
            </TouchableOpacity>

            <View style={styles.sheetActions}>
              <ActionBtn label="Cancel" onPress={onClose} variant="ghost" />
              <ActionBtn
                label={submitting ? "Submitting..." : "Submit"}
                variant="primary"
                onPress={handleSubmit}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function RequestCohostSheet({
  eventTitle,
  feeCentavos,
  benefits,
  onClose,
  onSubmit,
}: {
  eventTitle: string;
  feeCentavos: number;
  benefits?: string;
  onClose: () => void;
  onSubmit: (expectedCount: number, message?: string) => Promise<void>;
}) {
  const { colors: themeColors, isNightMode } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardOffset = useKeyboardOffset();
  const isKeyboardOpen = keyboardOffset > 0;

  const [expectedCount, setExpectedCount] = useState('25');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState<'count' | 'msg' | null>(null);

  const feePesos = Math.round(feeCentavos / 100);

  const handleSubmit = async () => {
    const count = parseInt(expectedCount, 10);
    if (isNaN(count) || count < 1) {
      Alert.alert('Invalid Count', 'Please enter at least 1 expected participant.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(count, message.trim() || undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[
          styles.sheetOverlay,
          Platform.OS === 'android' && isKeyboardOpen ? { paddingBottom: keyboardOffset } : null,
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              paddingBottom: isKeyboardOpen && Platform.OS === 'android'
                ? 16
                : Math.max(insets.bottom + 16, 28),
              maxHeight: isKeyboardOpen ? '92%' : '85%',
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            <Text style={[styles.sheetTitle, { color: themeColors.text }]}>Apply as Event Cohost</Text>
            <Text style={[styles.meta, { color: themeColors.textMuted, marginBottom: 12 }]}>
              {eventTitle} · {feePesos > 0 ? `Fee: ₱${feePesos.toLocaleString()}` : 'Free Cohosting'}
            </Text>

            {benefits ? (
              <View style={[styles.benefitsBanner, { backgroundColor: isNightMode ? themeColors.bg : '#F8FAFC', borderColor: themeColors.border }]}>
                <Ionicons name="gift-outline" size={16} color={themeColors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.benefitsTitle, { color: themeColors.primary }]}>Cohost Benefits</Text>
                  <Text style={[styles.benefitsText, { color: themeColors.text }]}>
                    {benefits}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.label, { color: themeColors.text, marginTop: 10 }]}>Expected Delegates / Attendees</Text>
            <TextInput
              style={[
                styles.sheetTextInput,
                {
                  backgroundColor: themeColors.bg,
                  borderColor: themeColors.border,
                  color: themeColors.text,
                },
                isInputFocused === 'count' && { borderColor: themeColors.primary, borderWidth: 1.5 },
              ]}
              value={expectedCount}
              onChangeText={t => setExpectedCount(t.replace(/[^0-9]/g, ''))}
              onFocus={() => setIsInputFocused('count')}
              onBlur={() => setIsInputFocused(null)}
              keyboardType="number-pad"
              placeholder="e.g. 25"
              placeholderTextColor={themeColors.textMuted}
            />

            <Text style={[styles.label, { color: themeColors.text, marginTop: 12 }]}>Note or Proposal for Organizer (Optional)</Text>
            <TextInput
              style={[
                styles.sheetTextInput,
                {
                  backgroundColor: themeColors.bg,
                  borderColor: themeColors.border,
                  color: themeColors.text,
                  minHeight: 70,
                  textAlignVertical: 'top',
                },
                isInputFocused === 'msg' && { borderColor: themeColors.primary, borderWidth: 1.5 },
              ]}
              value={message}
              onChangeText={setMessage}
              onFocus={() => setIsInputFocused('msg')}
              onBlur={() => setIsInputFocused(null)}
              placeholder="e.g. Caloocan delegating 25 youth leaders."
              placeholderTextColor={themeColors.textMuted}
              multiline
            />

            <View style={styles.sheetActions}>
              <ActionBtn label="Cancel" onPress={onClose} variant="ghost" />
              <ActionBtn
                label={submitting ? "Submitting..." : "Send Cohost Request"}
                variant="primary"
                onPress={handleSubmit}
              />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  list: { padding: 16, paddingBottom: 32 },
  summary: { borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 },
  summaryTitle: { fontSize: 15, fontWeight: '900' },
  statRow: { flexDirection: 'row', marginTop: 14, gap: 12 },
  stat: { flex: 1 },
  statValue: { fontSize: 17, fontWeight: '900' },
  statLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', marginTop: 2 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  noticeText: { fontSize: 12.5, fontStyle: 'italic' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, marginBottom: 16,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '800', fontSize: 13.5 },
  hint: { fontSize: 11.5, fontStyle: 'italic', marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubName: { fontSize: 14, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 3, fontWeight: '600' },
  message: { fontSize: 12.5, marginTop: 10, fontStyle: 'italic', lineHeight: 17 },
  paymentBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.2)' },
  link: { fontSize: 12.5, fontWeight: '700', textDecorationLine: 'underline' },
  viewReceiptRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1 },
  actionBtnText: { fontSize: 12.5, fontWeight: '800' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 13, fontStyle: 'italic' },

  // payment sheet
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  label: { fontSize: 12.5, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, marginTop: 16,
  },
  uploadBtnText: { fontSize: 13, fontWeight: '800' },
  sheetActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 20 },
  sheetTextInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  benefitsBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 4,
  },
  benefitsTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  benefitsText: {
    fontSize: 12,
    lineHeight: 16,
  },

  // Receipt preview dialog modal
  receiptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '88%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  receiptCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapHint: {
    fontSize: 11.5,
    marginTop: 4,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  receiptImageWrap: {
    width: '100%',
    height: 340,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    position: 'relative',
  },
  receiptImage: {
    width: '100%',
    height: '100%',
  },
  zoomBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  zoomBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  receiptDoneBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiptDoneText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
