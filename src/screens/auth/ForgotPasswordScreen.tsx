import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import RotaryWheel from '../../components/RotaryWheel';
import { KeyboardAwareScrollView, KeyboardAwareScrollHandle, useKeyboardAwareFocus } from '../../components/KeyboardAwareScrollView';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

const RESEND_COOLDOWN = 60; // seconds; client-side guard on top of Supabase's own rate limit

/** Partially masks an email for display: jmlinguito@gmail.com → j•••••••••@g••••.com */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const domName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  const maskLocal = local[0] + '•'.repeat(Math.max(2, local.length - 1));
  const maskDom = domName[0] + '•'.repeat(Math.max(1, domName.length - 1));
  return `${maskLocal}@${maskDom}${tld}`;
}

export default function ForgotPasswordScreen({ navigation, route }: Props) {
  const { requestPasswordReset, confirmPasswordReset } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [phase, setPhase] = useState<'request' | 'reset' | 'done'>('request');
  const [username, setUsername] = useState(route.params?.username ?? '');
  // The account email resolved from the username. Kept only to complete the reset
  // (verifyOtp needs it) and shown masked — never displayed in full.
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const kavRef = useRef<KeyboardAwareScrollHandle>(null);
  const onInputFocus = useKeyboardAwareFocus(kavRef);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) { if (timer.current) clearInterval(timer.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    setError(null); setNotice(null);
    if (!username.trim()) {
      setError('Please enter your username.');
      return;
    }
    setLoading(true);
    const { error: reqError, email } = await requestPasswordReset(username);
    setLoading(false);
    // No account for that username → tell the user (this flow verifies existence).
    if (reqError) { setError(reqError); return; }
    if (email) setResolvedEmail(email);
    setNotice(`We've sent a 6-digit reset code to ${maskEmail(email ?? resolvedEmail)}. Check your inbox (and spam).`);
    setPhase('reset');
    startCooldown();
  };

  const submitReset = async () => {
    setError(null); setNotice(null);
    if (!code.trim()) { setError('Enter the 6-digit code from the email.'); return; }
    if (newPw.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('The two passwords do not match.'); return; }
    setLoading(true);
    const { error: resetError } = await confirmPasswordReset(resolvedEmail, code, newPw);
    setLoading(false);
    if (resetError) { setError(resetError); return; }
    // confirmPasswordReset already signed the user out; show a success confirmation
    // and let them return to Login to sign in with the new password.
    if (timer.current) clearInterval(timer.current);
    setPhase('done');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
      <KeyboardAwareScrollView
        ref={kavRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
          {phase === 'done' ? (
            <View style={styles.doneWrap}>
              <View style={[styles.doneIconWrap, { backgroundColor: themeColors.success + '1A' }]}>
                <Ionicons name="checkmark-circle" size={72} color={themeColors.success} />
              </View>
              <Text style={[styles.doneTitle, { color: themeColors.text }]}>Password changed</Text>
              <Text style={[styles.doneBody, { color: themeColors.textMuted }]}>
                Your password has been updated. Please sign in again with your new password.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.doneBtn, { backgroundColor: themeColors.primary }]}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.85}
              >
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={22} color={themeColors.text} />
            <Text style={[styles.backText, { color: themeColors.text }]}>Back</Text>
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <RotaryWheel size={64} color={themeColors.primary} style={{ marginBottom: 12 }} />
            <Text style={[styles.title, { color: themeColors.text }]}>Reset your password</Text>
            <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
              {phase === 'request'
                ? 'Enter your username and we\'ll send a reset code to the email on your account.'
                : 'Enter the code we emailed you and choose a new password.'}
            </Text>
          </View>

          {error ? (
            <View style={[styles.banner, { backgroundColor: isNightMode ? themeColors.cardBg : '#FEF2F2', borderColor: themeColors.danger, borderWidth: isNightMode ? 1 : 0 }]}>
              <Ionicons name="alert-circle" size={16} color={themeColors.danger} />
              <Text style={[styles.bannerText, { color: themeColors.danger }]}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <View style={[styles.banner, { backgroundColor: isNightMode ? themeColors.cardBg : '#FDF2F7', borderColor: themeColors.primary, borderWidth: isNightMode ? 1 : 0 }]}>
              <Ionicons name="mail-outline" size={16} color={themeColors.primary} />
              <Text style={[styles.bannerText, { color: themeColors.primary }]}>{notice}</Text>
            </View>
          ) : null}

          {phase === 'request' ? (
            <>
              <Text style={[styles.fieldLabel, { color: themeColors.primary }]}>Username</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                  focusedField === 'username' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                ]}
                value={username}
                onChangeText={setUsername}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                placeholder="your username"
                placeholderTextColor={themeColors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={sendCode}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: themeColors.primary }, loading && styles.btnDisabled]}
                onPress={sendCode}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>Send Reset Code</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.sentToRow, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
                <Ionicons name="mail-outline" size={16} color={themeColors.textMuted} />
                <Text style={[styles.sentToText, { color: themeColors.textMuted }]}>
                  Code sent to <Text style={[styles.sentToEmail, { color: themeColors.text }]}>{maskEmail(resolvedEmail)}</Text>
                </Text>
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.primary }]}>Reset Code</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                  focusedField === 'code' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                ]}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={themeColors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={10}
                onFocus={() => {
                  setFocusedField('code');
                  onInputFocus();
                }}
                onBlur={() => setFocusedField(null)}
              />

              <Text style={[styles.fieldLabel, { color: themeColors.primary }]}>New Password</Text>
              <View
                style={[
                  styles.passwordWrap,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                  focusedField === 'newPw' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                ]}
              >
                <TextInput
                  style={[styles.passwordInput, { color: themeColors.text }]}
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="At least 6 characters"
                  placeholderTextColor={themeColors.textMuted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  onFocus={() => {
                    setFocusedField('newPw');
                    onInputFocus();
                  }}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={focusedField === 'newPw' ? themeColors.primary : themeColors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.fieldLabel, { color: themeColors.primary }]}>Confirm New Password</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
                  focusedField === 'confirmPw' && { borderColor: themeColors.primary, borderWidth: 1.5 },
                ]}
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="Re-enter new password"
                placeholderTextColor={themeColors.textMuted}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                onSubmitEditing={submitReset}
                onFocus={() => {
                  setFocusedField('confirmPw');
                  onInputFocus();
                }}
                onBlur={() => setFocusedField(null)}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: themeColors.primary }, loading && styles.btnDisabled]}
                onPress={submitReset}
                activeOpacity={0.85}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="lock-closed" size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>Update Password</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendBtn}
                onPress={sendCode}
                disabled={cooldown > 0 || loading}
              >
                <Text style={[styles.resendText, { color: themeColors.primary }, (cooldown > 0 || loading) && { color: themeColors.textMuted }]}>
                  {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Didn\'t get it? Resend code'}
                </Text>
              </TouchableOpacity>
            </>
          )}
          </>
          )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 15, fontWeight: '600' },
  logoWrap: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  subtitle: { fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 12, lineHeight: 18 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 12 },
  noticeBanner: {},
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  sentToRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4, borderWidth: 1 },
  sentToText: { flex: 1, fontSize: 13 },
  sentToEmail: { fontWeight: '700' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingRight: 14 },
  passwordInput: { flex: 1, padding: 14, fontSize: 16 },
  eyeBtn: { padding: 4 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 24 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.7 },
  resendBtn: { marginTop: 18, alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '700' },
  doneWrap: { alignItems: 'center', paddingTop: 48 },
  doneIconWrap: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  doneTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  doneBody: { fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20, paddingHorizontal: 12 },
  doneBtn: { alignSelf: 'stretch', marginTop: 28 },
});
