import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import AppSwitch from '../../components/AppSwitch';
import { RootStackParamList } from '../../navigation/types';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { usePreferences } from '../../context/PreferencesContext';
import RoleBadgeIcon from '../../components/RoleBadgeIcon';
import { VerifiedName } from '../../components/VerifiedCheck';
import RotaryWheel from '../../components/RotaryWheel';
import { ROLE_BADGES, getHighestRoleBadge, positionRoleLabel } from '../../utils/roles';
import { getRotaryYear } from '../../utils/hoursCalculation';
import TermsAndPrivacyModal from '../../components/TermsAndPrivacyModal';
import { SignatureModal } from '../../components/SignatureModal';
import { SignatureImage } from '../../components/SignatureImage';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { exportUserDataArchive } from '../../utils/csvExport';
import { isSafetyNetworkEnabled, setSafetyNetworkEnabled } from '../../services/backgroundLocation';
import * as Location from 'expo-location';
import { LocationPermissionModal } from '../../components/location/LocationPermissionModal';
import { registerForPushNotificationsAsync } from '../../services/notifications';
import AppModalKeyboardWrapper from '../../components/keyboard/AppModalKeyboardWrapper';
import { Club } from '../../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { user, changePassword, updateProfile, requestEmailChange, confirmEmailChange, signOut } = useAuth();
  const { clubs, participants, events, impacts, removeUser } = useData();
  const { showToast } = useToast();
  const { themeMode, setThemeMode, isNightMode, colors: themeColors } = useTheme();
  const { pushEnabled, setPushEnabled, showActiveStatus, setShowActiveStatus, highAccuracyGps, setHighAccuracyGps, autoCheckIn, setAutoCheckIn } = usePreferences();

  const [safetyNetworkActive, setSafetyNetworkActive] = useState(true);

  React.useEffect(() => {
    isSafetyNetworkEnabled().then(setSafetyNetworkActive);
  }, []);

  const [locationModalVisible, setLocationModalVisible] = useState(false);

  const handleToggleSafetyNetwork = async (val: boolean) => {
    setSafetyNetworkActive(val);
    await setSafetyNetworkEnabled(val);
    showToast({
      title: 'Safety Network',
      message: val ? 'Emergency Safety Network enabled' : 'Emergency Safety Network disabled',
      type: 'info',
    });
  };

  const [confirmDeleteAccountVisible, setConfirmDeleteAccountVisible] = useState(false);

  // Club transfer state
  const [clubModalVisible, setClubModalVisible] = useState(false);
  const [clubSearch, setClubSearch] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [pendingClubTransfer, setPendingClubTransfer] = useState<Club | null>(null);
  const [confirmTransferVisible, setConfirmTransferVisible] = useState(false);

  // Legal modal state
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy'>('terms');

  // Pronoun / Gender modal state
  const [pronounModalVisible, setPronounModalVisible] = useState(false);
  const [pronounSaving, setPronounSaving] = useState(false);

  const getPronounLabel = (g?: string | null) => {
    const upper = g?.toUpperCase()?.trim();
    if (upper === 'FEMALE' || upper === 'SHE' || upper === 'F') return 'She / Her (her)';
    if (upper === 'MALE' || upper === 'HE' || upper === 'M') return 'He / Him (his)';
    if (upper === 'OTHER' || upper === 'THEY') return 'They / Them (their)';
    return 'Not specified (their)';
  };

  // Change-password modal state
  const [pwModalVisible, setPwModalVisible] = useState(false);
  // Email change: request a code to the NEW address, then confirm it. Two steps so
  // a typo simply never receives a code, leaving the account untouched.
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailStep, setEmailStep] = useState<'enter' | 'confirm' | 'done'>('enter');
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const closeEmailModal = () => {
    setEmailModalVisible(false);
    setEmailStep('enter');
    setNewEmail('');
    setEmailCode('');
    setEmailError(null);
    setEmailBusy(false);
  };

  const submitEmailRequest = async () => {
    setEmailBusy(true);
    setEmailError(null);
    const { error } = await requestEmailChange(newEmail);
    setEmailBusy(false);
    if (error) { setEmailError(error); return; }
    setEmailStep('confirm');
  };

  const submitEmailConfirm = async () => {
    if (!emailCode.trim()) { setEmailError('Enter the 6-digit code.'); return; }
    setEmailBusy(true);
    setEmailError(null);
    const { error } = await confirmEmailChange(newEmail, emailCode);
    setEmailBusy(false);
    if (error) { setEmailError(error); return; }
    setEmailStep('done');
  };
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [retypePw, setRetypePw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const closePwModal = () => {
    setPwModalVisible(false);
    setCurrentPw(''); setNewPw(''); setRetypePw('');
    setPwError(null); setPwSuccess(false); setShowPw(false);
  };

  const handleChangePassword = async () => {
    setPwError(null);
    if (!currentPw || !newPw || !retypePw) {
      setPwError('Please fill in all three fields.');
      return;
    }
    if (newPw.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (newPw !== retypePw) {
      setPwError('New password and its confirmation do not match.');
      return;
    }
    if (newPw === currentPw) {
      setPwError('New password must be different from the current one.');
      return;
    }
    setPwLoading(true);
    const { error } = await changePassword(currentPw, newPw);
    setPwLoading(false);
    if (error) {
      setPwError(error);
      return;
    }
    setPwSuccess(true);
    setCurrentPw(''); setNewPw(''); setRetypePw('');
  };

  // Settings state
  const [eventReminders, setEventReminders] = useState(true);
  const [inquiryAlerts, setInquiryAlerts] = useState(true);
  const [joinRequestsAlerts, setJoinRequestsAlerts] = useState(true);
  const [districtAnnouncements, setDistrictAnnouncements] = useState(true);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  if (!user) return null;

  const currentRY = getRotaryYear();
  const roleBadge = getHighestRoleBadge(user);

  const isOfficer =
    user.role === 'CLUB_PRESIDENT' ||
    user.role === 'DISTRICT_ADMIN' ||
    user.role === 'APP_ADMIN' ||
    user.club_role === 'CLUB_PRESIDENT' ||
    user.club_role === 'OFFICER' ||
    user.system_role === 'DISTRICT_ADMIN' ||
    user.system_role === 'APP_ADMIN' ||
    user.position?.toLowerCase().includes('president') ||
    user.position?.toLowerCase().includes('district') ||
    user.position?.toLowerCase().includes('drr');

  const handleSaveSignature = async (sigUri: string) => {
    try {
      await updateProfile({ signature_url: sigUri });
      showToast({
        type: 'success',
        title: 'Signature Updated',
        message: 'Official digital signature updated successfully!',
      });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update signature.');
    }
  };

  const handleRemoveSignature = () => {
    Alert.alert(
      'Remove Signature',
      'Are you sure you want to remove your registered digital signature? Issued certificates will fall back to a formal signature line.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await updateProfile({ signature_url: undefined });
            showToast({
              type: 'info',
              title: 'Signature Removed',
              message: 'Digital signature removed.',
            });
          },
        },
      ]
    );
  };

  const handleSaveProfile = () => {
    Alert.alert('Settings Saved', 'Your preferences have been updated successfully.');
  };

  const cardStyle = [styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }];
  const titleStyle = [styles.rowTitle, { color: themeColors.text }];
  const subStyle = [styles.rowSub, { color: themeColors.textMuted }];
  const dividerStyle = [styles.divider, { backgroundColor: themeColors.border }];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>

        {/* 🌟 Official Rotary Year Charter Banner */}
        <TouchableOpacity
          style={[styles.ryBannerCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}
          onPress={() => navigation.navigate('ActivityPortfolio')}
          activeOpacity={0.8}
        >
          <View style={styles.ryBannerHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <RotaryWheel size={22} />
              <Text style={[styles.ryBannerTheme, { color: themeColors.primary }]}>ROTARACT DISTRICT 3800</Text>
            </View>
            <View style={[styles.ryYearBadge, { backgroundColor: themeColors.primary + '18' }]}>
              <Text style={[styles.ryYearText, { color: themeColors.primary }]}>{currentRY.label}</Text>
            </View>
          </View>

          <View style={styles.ryBannerBody}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.ryClubName, { color: themeColors.text }]}>{user.club_name || 'Rotaract Club'}</Text>
              <Text style={[styles.ryPosition, { color: themeColors.textMuted }]}>
                {positionRoleLabel(user.position, user)} • {user.verification_status === 'VERIFIED' ? 'Verified Member' : 'Pending Verification'}
              </Text>
            </View>
            <View style={styles.ryViewPortfolioBtn}>
              <Text style={[styles.ryViewPortfolioText, { color: themeColors.primary }]}>Portfolio</Text>
              <Ionicons name="chevron-forward" size={14} color={themeColors.primary} />
            </View>
          </View>
        </TouchableOpacity>

        {/* 👤 ACCOUNT & MEMBERSHIP PROFILE */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>ACCOUNT & MEMBERSHIP</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="person-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <VerifiedName user={user} textStyle={titleStyle} checkSize={14} />
                <Text style={subStyle}>{positionRoleLabel(user.position, user)} • {user.club_name}</Text>
              </View>
              {roleBadge ? (
                <View style={[styles.roleChip, { backgroundColor: roleBadge.color + '1F', borderColor: roleBadge.color }]}>
                  <RoleBadgeIcon badge={roleBadge} size={11} />
                  <Text style={[styles.roleChipText, { color: roleBadge.color }]}>{roleBadge.label}</Text>
                </View>
              ) : null}
            </View>

            <View style={dividerStyle} />

            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('Rotary Member ID', `Your ID: 1048${user.id.replace(/[^0-9]/g, '').padStart(4, '0').slice(-4)}`)}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="card-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Rotary International ID</Text>
                <Text style={subStyle}>RI ID: 1048{user.id.replace(/[^0-9]/g, '').padStart(4, '0').slice(-4)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity style={styles.row} onPress={() => setEmailModalVisible(true)}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="mail-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Email Address</Text>
                <Text style={subStyle}>{user.email}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity style={styles.row} onPress={() => setPronounModalVisible(true)}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="person-circle-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Pronouns / Certificate Salutation</Text>
                <Text style={subStyle}>{getPronounLabel(user?.gender)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                setClubSearch('');
                setClubModalVisible(true);
              }}
            >
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="business-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Club Affiliation</Text>
                <Text style={subStyle}>{user.club_name || 'Select Club'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity style={styles.row} onPress={() => setPwModalVisible(true)}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="lock-closed-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Change Password</Text>
                <Text style={subStyle}>Update your account password</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 🎨 APPEARANCE & THEME */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>APPEARANCE & THEME</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name={themeMode === 'DARK' ? 'moon' : themeMode === 'LIGHT' ? 'sunny' : 'phone-portrait-outline'} size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>App Theme</Text>
                <Text style={subStyle}>
                  {themeMode === 'SYSTEM'
                    ? `Match device setting (${isNightMode ? 'Dark' : 'Light'})`
                    : themeMode === 'DARK'
                    ? 'Always Dark Mode'
                    : 'Always Light Mode'}
                </Text>
              </View>
            </View>

            <View style={[styles.privacySegmentWrap, { backgroundColor: themeColors.surface }]}>
              <TouchableOpacity
                style={[
                  styles.privacySegmentBtn,
                  themeMode === 'SYSTEM' && { backgroundColor: themeColors.primary },
                ]}
                onPress={() => setThemeMode('SYSTEM')}
              >
                <Text
                  style={[
                    styles.privacySegmentText,
                    { color: themeMode === 'SYSTEM' ? '#fff' : themeColors.textMuted },
                  ]}
                >
                  System
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.privacySegmentBtn,
                  themeMode === 'LIGHT' && { backgroundColor: themeColors.primary },
                ]}
                onPress={() => setThemeMode('LIGHT')}
              >
                <Text
                  style={[
                    styles.privacySegmentText,
                    { color: themeMode === 'LIGHT' ? '#fff' : themeColors.textMuted },
                  ]}
                >
                  Light
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.privacySegmentBtn,
                  themeMode === 'DARK' && { backgroundColor: themeColors.primary },
                ]}
                onPress={() => setThemeMode('DARK')}
              >
                <Text
                  style={[
                    styles.privacySegmentText,
                    { color: themeMode === 'DARK' ? '#fff' : themeColors.textMuted },
                  ]}
                >
                  Dark
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 🔔 NOTIFICATION PREFERENCES */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>NOTIFICATION PREFERENCES</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="phone-portrait-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Push Notifications</Text>
                <Text style={subStyle}>Get alerts even when the app is closed. Your notification history stays available in your Inbox.</Text>
              </View>
              <AppSwitch
                value={pushEnabled}
                onValueChange={setPushEnabled}
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="alarm-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Event Reminders</Text>
                <Text style={subStyle}>Alerts for upcoming events and check-ins</Text>
              </View>
              <AppSwitch
                value={eventReminders}
                onValueChange={setEventReminders}
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Inquiries & Messages</Text>
                <Text style={subStyle}>Direct messages from Rotaractors</Text>
              </View>
              <AppSwitch
                value={inquiryAlerts}
                onValueChange={setInquiryAlerts}
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="person-add-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Join Requests & Approvals</Text>
                <Text style={subStyle}>Notifications for event registrations</Text>
              </View>
              <AppSwitch
                value={joinRequestsAlerts}
                onValueChange={setJoinRequestsAlerts}
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="megaphone-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>District Announcements</Text>
                <Text style={subStyle}>District 3800 news and updates</Text>
              </View>
              <AppSwitch
                value={districtAnnouncements}
                onValueChange={setDistrictAnnouncements}
              />
            </View>
          </View>
        </View>

        {/* 🔒 PRIVACY & VISIBILITY */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>PRIVACY & VISIBILITY</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="shield-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Contact Info Privacy</Text>
                <Text style={subStyle}>
                  {user.contact_privacy === 'ONLY_ME'
                    ? 'Hidden from all other members'
                    : user.contact_privacy === 'MY_CLUB_ONLY'
                    ? 'Visible only to your club members'
                    : 'Visible to all verified Rotaractors'}
                </Text>
              </View>
            </View>

            {/* 3-Way Privacy Segment */}
            <View style={[styles.privacySegmentWrap, { backgroundColor: themeColors.surface }]}>
              <TouchableOpacity
                style={[
                  styles.privacySegmentBtn,
                  (user.contact_privacy === 'ALL_VERIFIED' || !user.contact_privacy) && { backgroundColor: themeColors.primary },
                ]}
                onPress={() => updateProfile({ contact_privacy: 'ALL_VERIFIED' })}
              >
                <Text
                  style={[
                    styles.privacySegmentText,
                    { color: (user.contact_privacy === 'ALL_VERIFIED' || !user.contact_privacy) ? '#fff' : themeColors.textMuted },
                  ]}
                >
                  All Verified
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.privacySegmentBtn,
                  user.contact_privacy === 'MY_CLUB_ONLY' && { backgroundColor: themeColors.primary },
                ]}
                onPress={() => updateProfile({ contact_privacy: 'MY_CLUB_ONLY' })}
              >
                <Text
                  style={[
                    styles.privacySegmentText,
                    { color: user.contact_privacy === 'MY_CLUB_ONLY' ? '#fff' : themeColors.textMuted },
                  ]}
                >
                  Club Only
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.privacySegmentBtn,
                  user.contact_privacy === 'ONLY_ME' && { backgroundColor: themeColors.primary },
                ]}
                onPress={() => updateProfile({ contact_privacy: 'ONLY_ME' })}
              >
                <Text
                  style={[
                    styles.privacySegmentText,
                    { color: user.contact_privacy === 'ONLY_ME' ? '#fff' : themeColors.textMuted },
                  ]}
                >
                  Only Me
                </Text>
              </TouchableOpacity>
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="chatbubbles-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Allow Direct Inquiries</Text>
                <Text style={subStyle}>Let members outside your club start a chat with you</Text>
              </View>
              <AppSwitch
                value={user.allow_direct_inquiries !== false}
                onValueChange={v => updateProfile({ allow_direct_inquiries: v })}
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="ellipse" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Show Active Status</Text>
                <Text style={subStyle}>Let others see when you're online in chats</Text>
              </View>
              <AppSwitch
                value={showActiveStatus}
                onValueChange={setShowActiveStatus}
              />
            </View>

          </View>
        </View>

        {/* 🔔 NOTIFICATIONS & ALERTS */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>NOTIFICATIONS & ALERTS</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="notifications-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Push Notifications</Text>
                <Text style={subStyle}>Event invitations, approvals, live attendance passes & SOS alerts</Text>
              </View>
              <AppSwitch
                value={pushEnabled}
                onValueChange={async (val) => {
                  setPushEnabled(val);
                  if (val) {
                    await registerForPushNotificationsAsync();
                  }
                }}
              />
            </View>
          </View>
        </View>

        {/* 📍 GPS & CHECK-IN SETTINGS */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>GPS & EVENT CHECK-IN</Text>
          <View style={cardStyle}>
            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="navigate-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>High Accuracy GPS</Text>
                <Text style={subStyle}>Recommended for precise check-ins</Text>
              </View>
              <AppSwitch
                value={highAccuracyGps}
                onValueChange={setHighAccuracyGps}
              />
            </View>

            <View style={dividerStyle} />

            <View style={styles.row}>
              <View style={[styles.rowIconWrap, { backgroundColor: '#EF4444' + '1A' }]}>
                <Ionicons name="shield-half-outline" size={18} color="#EF4444" />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={titleStyle}>Emergency SOS Proximity Alerts</Text>
                <Text style={subStyle}>
                  Alerts you with instant chime when a member within 5 km triggers an SOS distress signal (0% idle battery)
                </Text>
              </View>
              <AppSwitch
                value={safetyNetworkActive}
                onValueChange={handleToggleSafetyNetwork}
                activeColor="#EF4444"
              />
            </View>

          </View>
        </View>

        {/* ✍️ OFFICER TOOLS: OFFICIAL DIGITAL SIGNATURE */}
        {isOfficer && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>OFFICER CREDENTIALS & SIGNATURE</Text>
            <View style={cardStyle}>
              <View style={styles.row}>
                <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                  <Ionicons name="pencil" size={18} color={themeColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={titleStyle}>Official Digital Signature</Text>
                  <Text style={subStyle}>
                    {user.signature_url
                      ? 'Active e-signature registered for official certificates'
                      : 'Add your signature to auto-sign certificates'}
                  </Text>
                </View>
                {user.signature_url ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: themeColors.primary + '18' }]}
                      onPress={() => setSignatureModalVisible(true)}
                    >
                      <Text style={[styles.smallBtnText, { color: themeColors.primary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: '#FEE2E2' }]}
                      onPress={handleRemoveSignature}
                    >
                      <Ionicons name="trash-outline" size={14} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.smallBtn, { backgroundColor: themeColors.primary }]}
                    onPress={() => setSignatureModalVisible(true)}
                  >
                    <Text style={[styles.smallBtnText, { color: '#fff' }]}>+ Add</Text>
                  </TouchableOpacity>
                )}
              </View>

              {user.signature_url && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 14, paddingTop: 4 }}>
                  <View style={[styles.signaturePreviewBox, { backgroundColor: themeColors.bg, borderColor: themeColors.border }]}>
                    <SignatureImage signatureUrl={user.signature_url} style={styles.signaturePreviewImg} />
                    <View style={styles.signatureBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                      <Text style={styles.signatureBadgeText}>Registered Signatory</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 🛡️ CERTIFICATE VERIFICATION */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>CERTIFICATE AUTHENTICITY</Text>
          <View style={cardStyle}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate('CertificateScanner')}
            >
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="qr-code-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Verify Certificate (QR Scanner)</Text>
                <Text style={subStyle}>Scan District 3800 Volunteer Certificate QR codes</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ℹ️ SUPPORT & APP INFO */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>SUPPORT & INFORMATION</Text>
          <View style={cardStyle}>
            <TouchableOpacity style={styles.row} onPress={() => Alert.alert('App Information', 'Rotaract Connect v1.0.0\nDistrict 3800 Philippines')}>
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="information-circle-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>App Version</Text>
                <Text style={subStyle}>v1.0.0 (District 3800)</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                setLegalModalTab('terms');
                setLegalModalVisible(true);
              }}
            >
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="document-text-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>User Agreement & Terms</Text>
                <Text style={subStyle}>Code of conduct and membership rules</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity
              style={styles.row}
              onPress={() => {
                setLegalModalTab('privacy');
                setLegalModalVisible(true);
              }}
            >
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Privacy Policy</Text>
                <Text style={subStyle}>Data Privacy Act of 2012 compliance</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 📦 ACCOUNT DATA & PRIVACY */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.primary }]}>ACCOUNT & DATA MANAGEMENT</Text>
          <View style={cardStyle}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => exportUserDataArchive(user, participants, events, impacts)}
            >
              <View style={[styles.rowIconWrap, { backgroundColor: themeColors.primary + '1A' }]}>
                <Ionicons name="download-outline" size={18} color={themeColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={titleStyle}>Export Data Archive</Text>
                <Text style={subStyle}>Download a complete JSON record of your profile and volunteer history</Text>
              </View>
              <Ionicons name="share-outline" size={16} color={themeColors.textMuted} />
            </TouchableOpacity>

            <View style={dividerStyle} />

            <TouchableOpacity
              style={styles.row}
              onPress={() => setConfirmDeleteAccountVisible(true)}
            >
              <View style={[styles.rowIconWrap, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="trash-outline" size={18} color={themeColors.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[titleStyle, { color: themeColors.danger }]}>Delete Account</Text>
                <Text style={subStyle}>Permanently remove your account and clear all local data</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={themeColors.danger} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.primary }]} onPress={handleSaveProfile}>
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.saveBtnText}>Save Preferences</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Club Transfer Confirmation Dialog */}
      <ConfirmDialog
        visible={confirmTransferVisible}
        title="Transfer Club Affiliation?"
        message={
          user?.verification_status === 'VERIFIED'
            ? `Transfer to ${pendingClubTransfer?.club_name}? Because your account is currently verified, transferring clubs will set your status to "Awaiting Club Validation" until your new Club President validates your roster membership.`
            : `Transfer your club affiliation to ${pendingClubTransfer?.club_name}?`
        }
        confirmLabel="Confirm Transfer"
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (pendingClubTransfer && user) {
            setConfirmTransferVisible(false);
            await updateProfile({
              club_id: pendingClubTransfer.id,
              club_name: pendingClubTransfer.club_name,
              verification_status: 'AWAITING_CLUB_VALIDATION',
            });
            showToast({
              type: 'info',
              title: 'Club Affiliation Updated',
              message: `Transferred to ${pendingClubTransfer.club_name}. Your new Club President has been notified.`,
            });
            setPendingClubTransfer(null);
          }
        }}
        onClose={() => {
          setConfirmTransferVisible(false);
          setPendingClubTransfer(null);
        }}
      />

      {/* Account Deletion Confirmation Dialog */}
      <ConfirmDialog
        visible={confirmDeleteAccountVisible}
        title="Permanently Delete Account?"
        message="Are you sure you want to permanently delete your Rotaract account? All your volunteer history, certificates, and profile data will be permanently removed. This action cannot be undone."
        confirmLabel="Delete Account"
        destructive
        onConfirm={async () => {
          setConfirmDeleteAccountVisible(false);
          if (user) {
            removeUser(user.id);
            await signOut();
          }
        }}
        onClose={() => setConfirmDeleteAccountVisible(false)}
      />

      {/* Club Selection Modal */}
      <Modal visible={clubModalVisible} transparent animationType="slide" onRequestClose={() => setClubModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.cardBg, maxHeight: '80%', borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Select Club</Text>
              <TouchableOpacity onPress={() => setClubModalVisible(false)}>
                <Ionicons name="close" size={22} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[
                styles.pwInput,
                { backgroundColor: themeColors.surface, color: themeColors.text, borderColor: themeColors.border, minHeight: 44, marginVertical: 12 },
                focusedInput === 'clubSearch' && { borderColor: themeColors.primary, borderWidth: 1.5 },
              ]}
              placeholder="Search clubs by name, city, province..."
              placeholderTextColor={themeColors.textMuted}
              value={clubSearch}
              onChangeText={setClubSearch}
              onFocus={() => setFocusedInput('clubSearch')}
              onBlur={() => setFocusedInput(null)}
            />
            <ScrollView style={{ maxHeight: 300 }}>
              {clubs
                .filter(c =>
                  !clubSearch.trim() ||
                  c.club_name.toLowerCase().includes(clubSearch.toLowerCase()) ||
                  c.city.toLowerCase().includes(clubSearch.toLowerCase()) ||
                  c.province.toLowerCase().includes(clubSearch.toLowerCase())
                )
                .map(c => {
                  const isCurrent = c.id === user?.club_id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.row,
                        {
                          paddingVertical: 12,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: themeColors.border,
                          backgroundColor: isCurrent ? themeColors.primary + '14' : 'transparent',
                        },
                      ]}
                      onPress={() => {
                        setClubModalVisible(false);
                        if (c.id !== user?.club_id) {
                          setPendingClubTransfer(c);
                          setConfirmTransferVisible(true);
                        }
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[titleStyle, isCurrent && { color: themeColors.primary, fontWeight: '700' }]}>
                          {c.club_name}
                        </Text>
                        <Text style={subStyle}>{c.city}, {c.province}</Text>
                      </View>
                      {isCurrent && <Ionicons name="checkmark-circle" size={18} color={themeColors.primary} />}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ⚧ PRONOUNS / GENDER SELECTION MODAL */}
      <Modal visible={pronounModalVisible} transparent animationType="fade" onRequestClose={() => setPronounModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Pronouns & Salutation</Text>
              <TouchableOpacity onPress={() => setPronounModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.pwHint, { color: themeColors.textMuted, marginBottom: 14 }]}>
              Select your pronouns to format official District 3800 volunteer certificates and service transcripts:
            </Text>

            <View style={{ gap: 8 }}>
              {[
                { id: 'FEMALE', label: 'She / Her', desc: 'Certificate phrasing: "...in verification of her participation..."' },
                { id: 'MALE', label: 'He / Him', desc: 'Certificate phrasing: "...in verification of his participation..."' },
                { id: 'OTHER', label: 'They / Them', desc: 'Certificate phrasing: "...in verification of their participation..."' },
                { id: null, label: 'Prefer Not to Say / Gender-Neutral', desc: 'Certificate phrasing: "...in verification of their participation..."' },
              ].map((opt) => {
                const isSelected = (opt.id === null && !user?.gender) || user?.gender?.toUpperCase() === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id ?? 'none'}
                    style={[
                      styles.row,
                      {
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1.5,
                        borderColor: isSelected ? themeColors.primary : themeColors.border,
                        backgroundColor: isSelected ? themeColors.primary + '14' : themeColors.surface,
                      },
                    ]}
                    disabled={pronounSaving}
                    onPress={async () => {
                      setPronounSaving(true);
                      try {
                        await updateProfile({ gender: opt.id as any });
                        showToast({
                          type: 'success',
                          title: 'Pronouns Updated',
                          message: `Your pronouns have been set to ${opt.label}.`,
                        });
                        setPronounModalVisible(false);
                      } catch (e) {
                        showToast({
                          type: 'error',
                          title: 'Update Failed',
                          message: 'Unable to save pronouns. Please try again.',
                        });
                      } finally {
                        setPronounSaving(false);
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[titleStyle, isSelected && { color: themeColors.primary, fontWeight: '700' }]}>
                        {opt.label}
                      </Text>
                      <Text style={[subStyle, { fontSize: 11, marginTop: 2 }]}>{opt.desc}</Text>
                    </View>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color={themeColors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={18} color={themeColors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      {/* 📜 TERMS & PRIVACY MODAL */}
      <TermsAndPrivacyModal
        visible={legalModalVisible}
        initialTab={legalModalTab}
        onClose={() => setLegalModalVisible(false)}
      />

      {/* 🔒 CHANGE EMAIL MODAL */}
      <Modal visible={emailModalVisible} transparent animationType="fade" onRequestClose={closeEmailModal}>
        <AppModalKeyboardWrapper>
          <View style={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                {emailStep === 'done' ? 'Email Updated' : 'Change Email Address'}
              </Text>
              <TouchableOpacity onPress={closeEmailModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            {emailError ? (
              <View style={styles.pwErrorBanner}>
                <Ionicons name="alert-circle" size={15} color={themeColors.danger} />
                <Text style={[styles.pwErrorText, { color: themeColors.danger }]}>{emailError}</Text>
              </View>
            ) : null}

            {emailStep === 'enter' ? (
              <>
                <Text style={[styles.pwLabel, { color: themeColors.primary }]}>New Email Address</Text>
                <TextInput
                  style={[
                    styles.pwInput,
                    { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                    focusedInput === 'newEmail' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                  ]}
                  value={newEmail}
                  onChangeText={setNewEmail}
                  onFocus={() => setFocusedInput('newEmail')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="you@example.com"
                  placeholderTextColor={themeColors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
                <Text style={[styles.pwHint, { color: themeColors.textMuted }]}>
                  We'll send a 6-digit code to this address. Your email only changes once you enter it.
                </Text>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: themeColors.primary }, emailBusy && { opacity: 0.6 }]}
                  onPress={submitEmailRequest}
                  disabled={emailBusy}
                >
                  {emailBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Send Code</Text>}
                </TouchableOpacity>
              </>
            ) : emailStep === 'confirm' ? (
              <>
                <Text style={[styles.pwLabel, { color: themeColors.primary }]}>Confirmation Code</Text>
                <TextInput
                  style={[
                    styles.pwInput,
                    { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text, letterSpacing: 4, textAlign: 'center' },
                    focusedInput === 'emailCode' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                  ]}
                  value={emailCode}
                  onChangeText={setEmailCode}
                  onFocus={() => setFocusedInput('emailCode')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="000000"
                  placeholderTextColor={themeColors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Text style={[styles.pwHint, { color: themeColors.textMuted }]}>
                  Sent to {newEmail}. Check spam if it hasn't arrived.
                </Text>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: themeColors.primary }, emailBusy && { opacity: 0.6 }]}
                  onPress={submitEmailConfirm}
                  disabled={emailBusy}
                >
                  {emailBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Confirm</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.pwSuccessWrap}>
                <Ionicons name="checkmark-circle" size={44} color={themeColors.success} />
                <Text style={[styles.pwSuccessText, { color: themeColors.text }]}>
                  Your email is now {newEmail}.
                </Text>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.primary, marginTop: 4 }]} onPress={closeEmailModal}>
                  <Text style={styles.saveBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </AppModalKeyboardWrapper>
      </Modal>

      {/* 🔒 CHANGE PASSWORD MODAL */}
      <Modal visible={pwModalVisible} transparent animationType="fade" onRequestClose={closePwModal}>
        <AppModalKeyboardWrapper>
          <View style={[styles.modalCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.text }]}>Change Password</Text>
              <TouchableOpacity onPress={closePwModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            {pwSuccess ? (
              <View style={styles.pwSuccessWrap}>
                <Ionicons name="checkmark-circle" size={44} color={themeColors.success} />
                <Text style={[styles.pwSuccessText, { color: themeColors.text }]}>
                  Your password has been updated.
                </Text>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.primary, marginTop: 4 }]} onPress={closePwModal}>
                  <Text style={styles.saveBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {pwError ? (
                  <View style={styles.pwErrorBanner}>
                    <Ionicons name="alert-circle" size={15} color={themeColors.danger} />
                    <Text style={[styles.pwErrorText, { color: themeColors.danger }]}>{pwError}</Text>
                  </View>
                ) : null}

                <Text style={[styles.pwLabel, { color: themeColors.primary }]}>Current Password</Text>
                <TextInput
                  style={[
                    styles.pwInput,
                    { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                    focusedInput === 'currentPw' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                  ]}
                  value={currentPw}
                  onChangeText={setCurrentPw}
                  onFocus={() => setFocusedInput('currentPw')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Enter current password"
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                />

                <Text style={[styles.pwLabel, { color: themeColors.primary }]}>New Password</Text>
                <TextInput
                  style={[
                    styles.pwInput,
                    { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                    focusedInput === 'newPw' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                  ]}
                  value={newPw}
                  onChangeText={setNewPw}
                  onFocus={() => setFocusedInput('newPw')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="At least 6 characters"
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                />

                <Text style={[styles.pwLabel, { color: themeColors.primary }]}>Retype New Password</Text>
                <TextInput
                  style={[
                    styles.pwInput,
                    { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                    focusedInput === 'retypePw' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                  ]}
                  value={retypePw}
                  onChangeText={setRetypePw}
                  onFocus={() => setFocusedInput('retypePw')}
                  onBlur={() => setFocusedInput(null)}
                  placeholder="Re-enter new password"
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  onSubmitEditing={handleChangePassword}
                />

                <TouchableOpacity style={styles.pwShowRow} onPress={() => setShowPw(v => !v)}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={16} color={themeColors.textMuted} />
                  <Text style={[styles.pwShowText, { color: themeColors.textMuted }]}>
                    {showPw ? 'Hide passwords' : 'Show passwords'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: themeColors.primary, opacity: pwLoading ? 0.7 : 1 }]}
                  onPress={handleChangePassword}
                  disabled={pwLoading}
                >
                  {pwLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={16} color="#fff" />
                      <Text style={styles.saveBtnText}>Update Password</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </AppModalKeyboardWrapper>
      </Modal>

      {/* ✍️ Signature Capture & Upload Modal */}
      <SignatureModal
        visible={signatureModalVisible}
        currentSignature={user.signature_url}
        onClose={() => setSignatureModalVisible(false)}
        onSave={handleSaveSignature}
      />

      {/* 📍 Location permission modal */}
      <LocationPermissionModal
        visible={locationModalVisible}
        onClose={() => setLocationModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginLeft: 4 },
  signaturePreviewBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  signaturePreviewImg: {
    width: '100%',
    height: 60,
  },
  signatureBadge: {
    position: 'absolute',
    bottom: 4,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  signatureBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#16A34A',
  },
  smallBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  columnRow: { paddingVertical: 12 },
  rowIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 1 },
  divider: { height: 1, marginLeft: 46 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  roleChipText: { fontSize: 10, fontWeight: '800' },
  radiusPills: { flexDirection: 'row', gap: 8, marginTop: 12, marginLeft: 44 },
  radiusPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  radiusText: { fontSize: 12, fontWeight: '700' },
  privacySegmentWrap: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 10, marginLeft: 46, marginBottom: 12 },
  privacySegmentBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, borderRadius: 8 },
  privacySegmentText: { fontSize: 11, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: 12, marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 16, borderWidth: 1, padding: 20 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  pwLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  pwHint: { fontSize: 12, lineHeight: 17, marginTop: 8, marginBottom: 4 },
  pwInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  pwShowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginBottom: 4 },
  pwShowText: { fontSize: 13, fontWeight: '600' },
  pwErrorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', padding: 10, borderRadius: 10, marginBottom: 4 },
  pwErrorText: { flex: 1, fontSize: 13, fontWeight: '600' },
  pwSuccessWrap: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  pwSuccessText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  ryBannerCard: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 16 },
  ryBannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  ryBannerTheme: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  ryYearBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  ryYearText: { fontSize: 11, fontWeight: '800' },
  ryBannerBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  ryClubName: { fontSize: 15, fontWeight: '800' },
  ryPosition: { fontSize: 12, marginTop: 2 },
  ryViewPortfolioBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'transparent' },
  ryViewPortfolioText: { fontSize: 12, fontWeight: '700' },
});
