import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Platform, Modal, Image, Alert, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView, useKeyboardAwareOnFocus } from '../../components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { zones } from '../../data/mockData';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import FullImageModal from '../../components/FullImageModal';
import TermsAndPrivacyModal from '../../components/TermsAndPrivacyModal';
import { PickedImage } from '../../services/storage';
import { ROTARACT_POSITIONS, getPositionClubRole } from '../../utils/roles';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const { clubs } = useData();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [position, setPosition] = useState('Member');
  const [isPositionDropdownOpen, setIsPositionDropdownOpen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModalVisible, setLegalModalVisible] = useState(false);
  const [legalModalTab, setLegalModalTab] = useState<'terms' | 'privacy'>('terms');
  // Hold the full picked asset (uri + base64) so the image can be uploaded to
  // Supabase Storage AFTER sign-up establishes a session (uploads need the new
  // user's id + auth). The `.uri` is only used for the on-screen preview.
  const [proofAsset, setProofAsset] = useState<PickedImage | null>(null);
  const [avatarAsset, setAvatarAsset] = useState<PickedImage | null>(null);
  const proofUrl = proofAsset?.uri ?? null;
  const avatarUrl = avatarAsset?.uri ?? null;
  const [fullImageUri, setFullImageUri] = useState<{ uri: string; title: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickImage = async (onPicked: (asset: PickedImage) => void, square: boolean) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Access to photos is required to upload an image.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        ...(square ? { aspect: [1, 1] as [number, number] } : {}),
        quality: 0.8,
        base64: true,
      });
      if (!res.canceled && res.assets?.[0]?.uri) {
        const a = res.assets[0];
        onPicked({ uri: a.uri, base64: a.base64, mimeType: a.mimeType, fileName: a.fileName });
      }
    } catch (e) {
      Alert.alert('Upload Error', 'Unable to open image library.');
    }
  };

  const handlePickProof = () => pickImage(setProofAsset, false);
  const handlePickAvatar = () => pickImage(setAvatarAsset, true);

  const selectedClub = clubs.find(c => c.id === selectedClubId);
  const selectedZone = selectedClub ? zones.find(z => z.id === selectedClub.zone_id) : null;

  const handleContactNumberChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 11);
    if (digitsOnly.length > 7) {
      setContactNumber(`${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4, 7)} ${digitsOnly.slice(7)}`);
    } else if (digitsOnly.length > 4) {
      setContactNumber(`${digitsOnly.slice(0, 4)} ${digitsOnly.slice(4)}`);
    } else {
      setContactNumber(digitsOnly);
    }
  };

  const handleMemberIdChange = (text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 8);
    setMemberId(digitsOnly);
  };

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const memberIdValid = memberId.length === 8;
  const canSubmit = Boolean(
    fullName.trim() &&
    email.trim() &&
    username.trim() &&
    password &&
    confirmPassword &&
    !passwordMismatch &&
    selectedClubId &&
    memberIdValid &&
    agreedToTerms
  );

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        keyboardDismissMode="on-drag"
      >
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('Login');
              }
            }}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color={colors.primary} />
            <Text style={styles.backBtnText}>Back to Sign In</Text>
          </TouchableOpacity>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>District 3800 • Rotaractors only</Text>

          {/* Profile photo — reviewers match it against the ID proof below. */}
          <View style={styles.avatarPickerWrap}>
            <TouchableOpacity
              style={styles.avatarCircle}
              activeOpacity={0.85}
              onPress={() => (avatarUrl
                ? setFullImageUri({ uri: avatarUrl, title: 'Profile Photo' })
                : handlePickAvatar())}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={34} color="#fff" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarCameraBadge}
              onPress={handlePickAvatar}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="camera" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.avatarHint}>
            {avatarUrl ? 'Tap photo to view full resolution' : 'Upload a profile photo (optional)'}
          </Text>

          <Text style={styles.section}>Account</Text>
          <Field label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Juan Dela Cruz" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <Field label="Contact Number" value={contactNumber} onChangeText={handleContactNumberChange} placeholder="0917 123 4567" keyboardType="phone-pad" />
          <Field label="Username" value={username} onChangeText={setUsername} placeholder="juandc" autoCapitalize="none" />

          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            showPassword={showPassword}
            setShowPassword={setShowPassword}
          />

          <PasswordField
            label="Re-enter Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            showPassword={showConfirmPassword}
            setShowPassword={setShowConfirmPassword}
            error={passwordMismatch ? 'Passwords do not match' : undefined}
          />

          <Text style={styles.section}>Rotaract Information</Text>

          <Text style={styles.label}>Rotaract Club</Text>
          <TouchableOpacity
            style={styles.selector}
            onPress={() => navigation.navigate('ClubSelect', { onSelect: (id) => setSelectedClubId(id) })}
          >
            <Text style={selectedClub ? styles.selectorText : styles.selectorPlaceholder}>
              {selectedClub ? selectedClub.club_name : 'Select your Rotaract Club'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <Field
            label="Member ID (8 digits)"
            value={memberId}
            onChangeText={handleMemberIdChange}
            placeholder="10482910"
            keyboardType="numeric"
            maxLength={8}
          />
          {memberId.length > 0 && memberId.length < 8 ? (
            <Text style={styles.errorText}>Rotaract Member ID must be 8 digits</Text>
          ) : null}

          <View style={{ marginBottom: 16 }}>
            <Text style={styles.label}>Position *</Text>
            <TouchableOpacity
              style={[styles.selector, isPositionDropdownOpen && { borderColor: colors.primary }]}
              onPress={() => setIsPositionDropdownOpen(!isPositionDropdownOpen)}
            >
              <Text style={position ? styles.selectorText : styles.selectorPlaceholder}>
                {position || 'Select Position'}
              </Text>
              <Ionicons name={isPositionDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {isPositionDropdownOpen && (
              <View style={styles.inlineDropdownMenu}>
                <ScrollView
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                  style={{ maxHeight: 220 }}
                >
                  {ROTARACT_POSITIONS.map(p => {
                    const isSelected = position === p;
                    const clubRole = getPositionClubRole(p);
                    const roleHint = clubRole === 'CLUB_PRESIDENT' ? 'Executive' : clubRole === 'OFFICER' ? 'Officer' : 'General';
                    return (
                      <TouchableOpacity
                        key={p}
                        style={[styles.overlayDropdownItem, isSelected && { backgroundColor: colors.primary + '14' }]}
                        onPress={() => {
                          setPosition(p);
                          setIsPositionDropdownOpen(false);
                        }}
                      >
                        <View style={styles.checkmarkWrap}>
                          {isSelected ? (
                            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                          ) : (
                            <Ionicons name="ellipse-outline" size={14} color={colors.textMuted} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.overlayDropdownText, { color: isSelected ? colors.primary : colors.text, fontWeight: isSelected ? '700' : '400' }]}>{p}</Text>
                          <Text style={{ fontSize: 11, color: isSelected ? colors.primary : colors.textMuted, marginTop: 1 }}>{roleHint}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>

          <Text style={styles.label}>Rotaract ID / Membership Proof (Optional)</Text>
          {proofUrl ? (
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.primary, height: 140 }}
                onPress={() => setFullImageUri({ uri: proofUrl, title: 'Uploaded Rotaract ID Proof' })}
              >
                <Image source={{ uri: proofUrl }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="expand" size={12} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>Tap for Full Res</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ marginTop: 6, alignSelf: 'flex-start' }}
                onPress={handlePickProof}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>Change Uploaded Photo</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.selector, { marginBottom: 16, borderStyle: 'dashed', borderWidth: 1.5, borderColor: colors.primary }]}
              onPress={handlePickProof}
            >
              <Ionicons name="image-outline" size={20} color={colors.primary} />
              <Text style={[styles.selectorText, { color: colors.primary, marginLeft: 8, flex: 1 }]}>
                Upload Rotaract ID or Roster Screenshot
              </Text>
              <Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}

          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.noteText}>
              {position === 'President'
                ? 'Your application will be reviewed by an Administrator.'
                : 'Your application will be reviewed by the Club President.'}
            </Text>
          </View>

          {/* User Agreement & Privacy Terms Checkbox Card */}
          <View style={styles.agreementCard}>
            <TouchableOpacity
              style={styles.checkboxRow}
              activeOpacity={0.8}
              onPress={() => setAgreedToTerms(prev => !prev)}
            >
              <View style={[styles.checkbox, agreedToTerms && styles.checkboxActive]}>
                {agreedToTerms && <Ionicons name="checkmark" size={14} color="#fff" />}
              </View>
              <View style={styles.agreementTextWrap}>
                <Text style={styles.agreementText}>
                  I have read and agree to the{' '}
                  <Text
                    style={styles.legalLink}
                    onPress={(e) => {
                      e.stopPropagation();
                      setLegalModalTab('terms');
                      setLegalModalVisible(true);
                    }}
                  >
                    User Agreement & Terms
                  </Text>{' '}
                  and{' '}
                  <Text
                    style={styles.legalLink}
                    onPress={(e) => {
                      e.stopPropagation();
                      setLegalModalTab('privacy');
                      setLegalModalVisible(true);
                    }}
                  >
                    Privacy Policy
                  </Text>
                  , and confirm that I am an active member of Rotary International / District 3800.
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.privacyNoteRow}>
              <Ionicons name="shield-checkmark-outline" size={13} color={colors.textMuted} />
              <Text style={styles.privacyNoteText}>
                Your data is protected under the Philippine Data Privacy Act (RA 10173).
              </Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (!canSubmit || loading) && styles.primaryBtnDisabled]}
            disabled={!canSubmit || loading}
            onPress={async () => {
              setLoading(true);
              setError(null);
              const result = await signUp(email, password, {
                full_name: fullName,
                username,
                contact_number: contactNumber,
                club_id: selectedClubId ?? '',
                club_name: selectedClub?.club_name ?? '',
                position,
                role: getPositionClubRole(position) === 'CLUB_PRESIDENT' ? 'CLUB_PRESIDENT' : 'MEMBER',
                avatar_asset: avatarAsset || undefined,
                member_id: memberId,
                proof_asset: proofAsset || undefined,
              });
              setLoading(false);

              if (result.error) {
                setError(result.error);
              } else if (result.needsVerification) {
                // Email confirmation required — verify the emailed code before the
                // account is activated.
                navigation.navigate('EmailVerification', { email: result.email ?? email });
              } else {
                navigation.navigate('VerificationPending');
              }
            }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Submit Application</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.navigate('Login');
              }
            }}
          >
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkTextBold}>Sign In</Text></Text>
          </TouchableOpacity>
      </KeyboardAwareScrollView>



      <TermsAndPrivacyModal
        visible={legalModalVisible}
        initialTab={legalModalTab}
        onClose={() => setLegalModalVisible(false)}
        onAccept={() => setAgreedToTerms(true)}
      />

      <FullImageModal
        visible={!!fullImageUri}
        imageUri={fullImageUri?.uri ?? null}
        title={fullImageUri?.title}
        onClose={() => setFullImageUri(null)}
      />
    </SafeAreaView>
  );
}

function Field(props: any) {
  const { label, ...rest } = props;
  const kavOnFocus = useKeyboardAwareOnFocus();
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        {...rest}
        onFocus={(e: any) => {
          if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
            setTimeout(() => {
              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
          kavOnFocus();       // lift above the keyboard (native)
          rest.onFocus?.(e);
        }}
      />
    </>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  showPassword,
  setShowPassword,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  error?: string;
}) {
  const kavOnFocus = useKeyboardAwareOnFocus();
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.passwordWrap, !!error && styles.inputError]}>
        <TextInput
          style={styles.passwordInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder || '••••••••'}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          onFocus={kavOnFocus}
        />
        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={() => setShowPassword(!showPassword)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={colors.textMuted}
          />
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 24, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, alignSelf: 'flex-start', paddingVertical: 6, paddingRight: 10, borderRadius: 8 },
  backBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  title: { fontSize: 28, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 8 },
  section: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 24, marginBottom: 4, letterSpacing: 1 },
  avatarPickerWrap: { alignSelf: 'center', marginTop: 18, position: 'relative' },
  avatarCircle: { width: 86, height: 86, borderRadius: 43, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarCameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  avatarHint: { alignSelf: 'center', marginTop: 8, fontSize: 12, color: colors.textMuted },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: colors.surface, color: colors.text },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingRight: 14,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: colors.text,
  },
  eyeBtn: {
    padding: 4,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
    fontWeight: '600',
  },
  selector: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectorText: { fontSize: 16, color: colors.text, flex: 1 },
  selectorPlaceholder: { fontSize: 16, color: colors.textMuted, flex: 1 },
  derivedBox: { marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#FDF2F7', borderWidth: 1, borderColor: '#F9D6E5' },
  derivedLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, marginTop: 6, letterSpacing: 0.5 },
  derivedValue: { fontSize: 14, color: colors.text, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  noteBox: { flexDirection: 'row', gap: 8, backgroundColor: '#EBF5FF', padding: 12, borderRadius: 12, marginTop: 16 },
  noteText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  primaryBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 12, marginTop: 24, alignItems: 'center' },
  primaryBtnDisabled: { backgroundColor: '#E4B0C6' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorBannerText: { flex: 1, fontSize: 13, color: colors.danger, fontWeight: '600' },
  linkBtn: { marginTop: 20, alignItems: 'center', paddingVertical: 10 },
  linkText: { color: colors.textMuted, fontSize: 14 },
  linkTextBold: { color: colors.primary, fontWeight: '700' },
  inlineDropdownMenu: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    marginTop: 6,
    marginBottom: 6,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  overlayDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
  },
  checkmarkWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayDropdownText: {
    fontSize: 15,
  },
  agreementCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  agreementTextWrap: {
    flex: 1,
  },
  agreementText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  privacyNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  privacyNoteText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
});
