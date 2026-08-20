import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Vibration,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import UserAvatar from '../UserAvatar';
import { VerifiedName } from '../VerifiedCheck';
import { RotaractEvent, AppUser, EventParticipant } from '../../types';

interface EventAttendanceScannerModalProps {
  visible: boolean;
  event: RotaractEvent;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_BOX_SIZE = SCREEN_WIDTH * 0.72;

export const EventAttendanceScannerModal: React.FC<EventAttendanceScannerModalProps> = ({
  visible,
  event,
  onClose,
}) => {
  const { users, participantsFor, checkIn, checkOut } = useData();
  const { colors: themeColors, isNightMode } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [isScanningActive, setIsScanningActive] = useState(true);

  // Scan Result Feedback State
  const [scanResult, setScanResult] = useState<{
    status: 'SUCCESS_CHECK_IN' | 'SUCCESS_CHECK_OUT' | 'ALREADY_CHECKED_OUT' | 'NOT_JOINED' | 'DIFFERENT_EVENT' | 'INVALID';
    user?: AppUser;
    participant?: EventParticipant;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (visible && !permission) {
      requestPermission();
    }
    if (visible) {
      setIsScanningActive(true);
      setScanResult(null);
    }
  }, [visible, permission]);

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (!isScanningActive || scanResult) return;
    setIsScanningActive(false);

    try {
      Vibration.vibrate(80);
    } catch {}

    let parsedPayload: any = null;

    // 1. Try parsing JSON format
    try {
      parsedPayload = JSON.parse(data);
    } catch {
      // 2. Try parsing plain-text formatted payload: RC_EVENT_PASS:eventId:userId:participantId
      if (data.startsWith('RC_EVENT_PASS:')) {
        const parts = data.split(':');
        if (parts.length >= 4) {
          parsedPayload = {
            type: 'RC_EVENT_PASS',
            eventId: parts[1],
            userId: parts[2],
            participantId: parts[3],
          };
        }
      }
    }

    if (!parsedPayload || parsedPayload.type !== 'RC_EVENT_PASS') {
      setScanResult({
        status: 'INVALID',
        message: 'Scanned barcode is not a recognized Rotaract Digital Event Pass.',
      });
      return;
    }

    // Check if pass belongs to this specific event
    if (parsedPayload.eventId !== event.id) {
      setScanResult({
        status: 'DIFFERENT_EVENT',
        message: 'This pass belongs to a different event. Please verify the event pass.',
      });
      return;
    }

    const attendee = users.find(u => u.id === parsedPayload.userId);
    const participants = participantsFor(event.id);
    const participant = participants.find(p => p.id === parsedPayload.participantId || p.user_id === parsedPayload.userId);

    if (!participant || participant.status !== 'JOINED') {
      setScanResult({
        status: 'NOT_JOINED',
        user: attendee,
        message: `${attendee?.full_name ?? 'This member'} is not registered as a confirmed participant for this event.`,
      });
      return;
    }

    // Process Attendance
    if (!participant.checked_in_at && participant.attendance_status !== 'ATTENDED') {
      // Step 1: Check In
      checkIn(participant.id, {
        checkedInAt: new Date().toISOString(),
        latitude: event.latitude,
        longitude: event.longitude,
        distanceMeters: 0,
        recordedBy: 'ORGANIZER_QR',
      });

      setScanResult({
        status: 'SUCCESS_CHECK_IN',
        user: attendee,
        participant: { ...participant, checked_in_at: new Date().toISOString(), attendance_status: 'ATTENDED' },
        message: 'Verified On-Site Check-In recorded successfully!',
      });
    } else if (!participant.checked_out_at) {
      // Step 2: Check Out
      checkOut(participant.id, {
        checkedOutAt: new Date().toISOString(),
        recordedBy: 'ORGANIZER_QR',
      });

      setScanResult({
        status: 'SUCCESS_CHECK_OUT',
        user: attendee,
        participant: { ...participant, checked_out_at: new Date().toISOString() },
        message: 'Event departure and volunteer hours finalized!',
      });
    } else {
      // Step 3: Already completed both
      setScanResult({
        status: 'ALREADY_CHECKED_OUT',
        user: attendee,
        participant,
        message: 'This participant has already completed both check-in and check-out.',
      });
    }
  };

  const resumeScanning = () => {
    setScanResult(null);
    setIsScanningActive(true);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Header Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.headerTitle}>QR Attendance Scanner</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {event.title}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.actionBtn, torch && styles.actionBtnActive]}
              onPress={() => setTorch(!torch)}
            >
              <Ionicons name={torch ? 'flash' : 'flash-outline'} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
            >
              <Ionicons name="camera-reverse-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Camera Viewfinder */}
        <View style={styles.cameraContainer}>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={48} color="#94A3B8" />
              <Text style={styles.permissionText}>Camera permission is required to scan passes</Text>
              <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
                <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing={facing}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={isScanningActive ? handleBarcodeScanned : undefined}
            />
          )}

          {/* Viewfinder Target Frame Overlay */}
          {permission?.granted && (
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.overlayTop} />
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.focusFrame}>
                  {/* Corner Reticles */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  {isScanningActive && <View style={styles.scanLine} />}
                </View>
                <View style={styles.overlaySide} />
              </View>
              <View style={styles.overlayBottom}>
                <Text style={styles.scanHint}>Align attendee's Digital Event Pass QR code inside frame</Text>
              </View>
            </View>
          )}

          {/* Bottom Confirmation Card (Overlay when scanned) */}
          {scanResult && (
            <View style={styles.resultCardWrapper}>
              <View
                style={[
                  styles.resultCard,
                  {
                    backgroundColor: isNightMode ? themeColors.cardBg : '#fff',
                    borderColor:
                      scanResult.status.startsWith('SUCCESS')
                        ? themeColors.success
                        : themeColors.danger,
                  },
                ]}
              >
                {/* Status Header */}
                <View style={styles.resultHeader}>
                  <View
                    style={[
                      styles.resultIconWrap,
                      {
                        backgroundColor: scanResult.status.startsWith('SUCCESS')
                          ? '#DCFCE7'
                          : '#FEE2E2',
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        scanResult.status.startsWith('SUCCESS')
                          ? 'checkmark-circle'
                          : 'alert-circle'
                      }
                      size={28}
                      color={
                        scanResult.status.startsWith('SUCCESS')
                          ? '#16A34A'
                          : '#DC2626'
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.resultStatusTitle,
                        {
                          color: scanResult.status.startsWith('SUCCESS')
                            ? '#16A34A'
                            : '#DC2626',
                        },
                      ]}
                    >
                      {scanResult.status === 'SUCCESS_CHECK_IN' && 'CHECKED IN!'}
                      {scanResult.status === 'SUCCESS_CHECK_OUT' && 'CHECKED OUT!'}
                      {scanResult.status === 'ALREADY_CHECKED_OUT' && 'COMPLETED'}
                      {scanResult.status === 'NOT_JOINED' && 'NOT REGISTERED'}
                      {scanResult.status === 'DIFFERENT_EVENT' && 'WRONG EVENT'}
                      {scanResult.status === 'INVALID' && 'INVALID PASS'}
                    </Text>
                    <Text style={[styles.resultMessage, { color: themeColors.textMuted }]}>
                      {scanResult.message}
                    </Text>
                  </View>
                </View>

                {/* Attendee Profile Info */}
                {scanResult.user && (
                  <View style={[styles.attendeeBox, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                    <UserAvatar user={scanResult.user} size={44} />
                    <View style={{ flex: 1 }}>
                      <VerifiedName
                        user={scanResult.user}
                        textStyle={[styles.attendeeName, { color: themeColors.text }]}
                        checkSize={15}
                      />
                      <Text style={[styles.attendeeClub, { color: themeColors.textMuted }]}>
                        {scanResult.user.position} • {scanResult.user.club_name}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Actions */}
                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.nextScanBtn} onPress={resumeScanning}>
                    <Ionicons name="scan" size={16} color="#fff" />
                    <Text style={styles.nextScanBtnText}>Scan Next Pass</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                    <Text style={[styles.doneBtnText, { color: themeColors.textMuted }]}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnActive: {
    backgroundColor: '#D41367',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 16,
  },
  permissionText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
  permissionBtn: {
    backgroundColor: '#D41367',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_BOX_SIZE,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  focusFrame: {
    width: SCAN_BOX_SIZE,
    height: SCAN_BOX_SIZE,
    position: 'relative',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 30,
  },
  scanHint: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 18,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#D41367',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 6,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 6,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 6,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 6,
  },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: '#D41367',
    shadowColor: '#D41367',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  resultCardWrapper: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  resultCard: {
    borderRadius: 20,
    borderWidth: 2,
    padding: 18,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    gap: 14,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resultIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultStatusTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  resultMessage: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  attendeeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  attendeeName: {
    fontSize: 14,
    fontWeight: '800',
  },
  attendeeClub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  resultActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nextScanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D41367',
    paddingVertical: 12,
    borderRadius: 12,
  },
  nextScanBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  doneBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  doneBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
