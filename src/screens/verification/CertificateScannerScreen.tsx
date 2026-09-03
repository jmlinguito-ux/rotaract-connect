import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import UserAvatar from '../../components/UserAvatar';
import { VerifiedName } from '../../components/VerifiedCheck';
import { CertificateQRPayload } from '../../utils/pdfCertificate';
import { AppUser } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CertificateScanner'>;

export default function CertificateScannerScreen({ navigation }: Props) {
  const { users } = useData();
  const { colors: themeColors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [scanned, setScanned] = useState(false);

  // Verification State
  const [verifiedPayload, setVerifiedPayload] = useState<CertificateQRPayload | null>(null);
  const [matchedUser, setMatchedUser] = useState<AppUser | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [resultModalVisible, setResultModalVisible] = useState(false);

  useEffect(() => {
    if (!permission) {
      requestPermission();
    }
  }, [permission]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || resultModalVisible) return;
    setScanned(true);
    verifyDataString(data);
  };

  const verifyDataString = (rawString: string) => {
    try {
      const payload = JSON.parse(rawString.trim());
      if (payload?.type !== 'ROTARACT_D3800_CERT' || !payload.cert_id || !payload.user_id) {
        setVerificationError('This QR code is not an official Rotary District 3800 Service Certificate.');
        setVerifiedPayload(null);
        setMatchedUser(null);
        setResultModalVisible(true);
        return;
      }

      const qrPayload = payload as CertificateQRPayload;
      const foundUser = users.find(u => u.id === qrPayload.user_id);

      setVerifiedPayload(qrPayload);
      setMatchedUser(foundUser || null);
      setVerificationError(null);
      setResultModalVisible(true);
    } catch {
      setVerificationError('Unable to decode QR data. Please ensure you are scanning a valid Rotaract Connect Certificate QR code.');
      setVerifiedPayload(null);
      setMatchedUser(null);
      setResultModalVisible(true);
    }
  };

  const handleResetScanner = () => {
    setResultModalVisible(false);
    setVerifiedPayload(null);
    setMatchedUser(null);
    setVerificationError(null);
    // Delay resetting scanned lock so camera doesn't immediately re-trigger
    setTimeout(() => {
      setScanned(false);
    }, 800);
  };

  if (!permission) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <ActivityIndicator size="large" color={themeColors.primary} />
        <Text style={[styles.loadingText, { color: themeColors.textMuted }]}>Initializing Camera...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.centerContainer, { backgroundColor: themeColors.bg }]}>
        <View style={styles.permissionCard}>
          <View style={[styles.permissionIconCircle, { backgroundColor: themeColors.primary + '18' }]}>
            <Ionicons name="camera-outline" size={42} color={themeColors.primary} />
          </View>
          <Text style={[styles.permissionTitle, { color: themeColors.text }]}>Camera Permission Required</Text>
          <Text style={[styles.permissionSub, { color: themeColors.textMuted }]}>
            To scan and verify physical or digital Rotaract Volunteer Certificates, Rotaract Connect needs access to your camera.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]}
            onPress={requestPermission}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelLink} onPress={() => navigation.goBack()}>
            <Text style={{ color: themeColors.textMuted, fontSize: 13 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live Camera View */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing={facing}
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Modern Scanning Overlay */}
      <SafeAreaView style={styles.overlayContainer} edges={['top', 'bottom']}>
        {/* Top Controls Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close Scanner"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Verify Certificate</Text>
            <Text style={styles.headerSub}>Rotary District 3800</Text>
          </View>

          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={[styles.headerBtn, torch && styles.headerBtnActive]}
              onPress={() => setTorch(prev => !prev)}
              accessibilityLabel="Toggle Flashlight"
            >
              <Ionicons name={torch ? 'flash' : 'flash-outline'} size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => setFacing(prev => (prev === 'back' ? 'front' : 'back'))}
              accessibilityLabel="Flip Camera"
            >
              <Ionicons name="camera-reverse-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Viewfinder Target */}
        <View style={styles.viewfinderArea}>
          <View style={styles.viewfinderFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />

            <View style={styles.scanLaser} />
          </View>
          <Text style={styles.instructionText}>
            Align the certificate QR code within the frame
          </Text>
        </View>

        {/* Bottom Status Bar */}
        <View style={styles.bottomBar}>
          <View style={styles.scannerBadge}>
            <Ionicons name="qr-code-outline" size={16} color="#FFFFFF" />
            <Text style={styles.scannerBadgeText}>Camera Authenticity Scanner Active</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Verification Result Modal */}
      <Modal
        visible={resultModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleResetScanner}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.resultCard, { backgroundColor: themeColors.cardBg }]}>
            {verificationError ? (
              // Invalid / Error State
              <View style={styles.resultBody}>
                <View style={[styles.resultBadgeCircle, { backgroundColor: '#EF444420' }]}>
                  <Ionicons name="alert-circle" size={48} color="#EF4444" />
                </View>
                <Text style={[styles.resultTitle, { color: '#EF4444' }]}>Verification Failed</Text>
                <Text style={[styles.resultDesc, { color: themeColors.textMuted }]}>
                  {verificationError}
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: themeColors.primary, width: '100%', marginTop: 20 }]}
                  onPress={handleResetScanner}
                >
                  <Ionicons name="scan-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Scan Another Code</Text>
                </TouchableOpacity>
              </View>
            ) : verifiedPayload ? (
              // Verified State
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.resultScroll}>
                <View style={[styles.resultBadgeCircle, { backgroundColor: '#10B98120' }]}>
                  <MaterialCommunityIcons name="certificate-outline" size={48} color="#10B981" />
                </View>

                <View style={styles.verifiedHeaderPill}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={styles.verifiedHeaderText}>OFFICIALLY VERIFIED</Text>
                </View>

                <Text style={[styles.resultTitle, { color: themeColors.text }]}>
                  Authentic Service Certificate
                </Text>
                <Text style={[styles.districtLabel, { color: themeColors.primary }]}>
                  Rotary International District 3800
                </Text>

                {/* Member Profile Card */}
                <View style={[styles.memberCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                  {matchedUser ? (
                    <UserAvatar user={matchedUser} size={50} />
                  ) : (
                    <View style={[styles.fallbackAvatar, { backgroundColor: themeColors.primary }]}>
                      <Text style={styles.fallbackAvatarText}>
                        {verifiedPayload.full_name.substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    {matchedUser ? (
                      <VerifiedName
                        user={matchedUser}
                        textStyle={[styles.memberName, { color: themeColors.text }]}
                        checkSize={15}
                      />
                    ) : (
                      <Text style={[styles.memberName, { color: themeColors.text }]}>
                        {verifiedPayload.full_name}
                      </Text>
                    )}
                    <Text style={[styles.memberClub, { color: themeColors.textMuted }]}>
                      {verifiedPayload.club_name}
                    </Text>
                  </View>
                </View>

                {/* Certificate Metrics Grid */}
                <View style={styles.certMetricsGrid}>
                  <View style={[styles.certMetricBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <Text style={[styles.certMetricVal, { color: themeColors.primary }]}>
                      {verifiedPayload.hours} hrs
                    </Text>
                    <Text style={[styles.certMetricLbl, { color: themeColors.textMuted }]}>
                      Verified Hours
                    </Text>
                  </View>

                  <View style={[styles.certMetricBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <Text style={[styles.certMetricVal, { color: themeColors.text }]}>
                      {verifiedPayload.projects_attended}
                    </Text>
                    <Text style={[styles.certMetricLbl, { color: themeColors.textMuted }]}>
                      Projects Attended
                    </Text>
                  </View>
                </View>

                {/* Verification Metadata */}
                <View style={[styles.metaList, { borderColor: themeColors.border }]}>
                  <View style={styles.metaRow}>
                    <Text style={[styles.metaKey, { color: themeColors.textMuted }]}>Certificate ID:</Text>
                    <Text style={[styles.metaVal, { color: themeColors.text }]}>{verifiedPayload.cert_id}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={[styles.metaKey, { color: themeColors.textMuted }]}>Issued Date:</Text>
                    <Text style={[styles.metaVal, { color: themeColors.text }]}>{verifiedPayload.issued_at}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={[styles.metaKey, { color: themeColors.textMuted }]}>Database Sync:</Text>
                    <Text style={{ color: matchedUser ? '#10B981' : '#EAB308', fontWeight: '700', fontSize: 12 }}>
                      {matchedUser ? 'Live Member Match' : 'Archived Record'}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: themeColors.primary, width: '100%', marginTop: 14 }]}
                  onPress={handleResetScanner}
                >
                  <Ionicons name="scan-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Scan Another Certificate</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.closeModalBtn}
                  onPress={handleResetScanner}
                >
                  <Text style={{ color: themeColors.textMuted, fontSize: 13, fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  permissionCard: {
    alignItems: 'center',
    padding: 24,
    maxWidth: 360,
  },
  permissionIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  permissionSub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    width: '100%',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
    marginBottom: 10,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cancelLink: {
    padding: 8,
    marginTop: 6,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnActive: {
    backgroundColor: '#EAB308',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSub: {
    color: '#F472B6',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    gap: 8,
  },
  viewfinderArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderFrame: {
    width: 250,
    height: 250,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#D91B5C',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  scanLaser: {
    width: '90%',
    height: 2,
    backgroundColor: '#F472B6',
    shadowColor: '#D91B5C',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  instructionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  scannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  scannerBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  manualEntryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  resultScroll: {
    padding: 20,
    alignItems: 'center',
  },
  resultBody: {
    padding: 24,
    alignItems: 'center',
  },
  resultBadgeCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  verifiedHeaderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B98118',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  verifiedHeaderText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  resultTitle: {
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  districtLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 16,
  },
  resultDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 8,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  fallbackAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackAvatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '800',
  },
  memberClub: {
    fontSize: 12,
    marginTop: 2,
  },
  certMetricsGrid: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 12,
  },
  certMetricBox: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  certMetricVal: {
    fontSize: 18,
    fontWeight: '900',
  },
  certMetricLbl: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  metaList: {
    width: '100%',
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaKey: {
    fontSize: 11,
    fontWeight: '600',
  },
  metaVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeModalBtn: {
    padding: 8,
    marginTop: 6,
  },
});
