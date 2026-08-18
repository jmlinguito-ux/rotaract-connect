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
    <SafeAreaView style={styles.safe}>
      <KeyboardAwareScrollView
        ref={kavRef}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
          {phase === 'done' ? (
            <View style={styles.doneWrap}>
              <View style={styles.doneIconWrap}>
                <Ionicons name="checkmark-circle" size={72} color={colors.success} />
              </View>
              <Text style={styles.doneTitle}>Password changed</Text>
              <Text style={styles.doneBody}>
                Your password has been updated. Please sign in again with your new password.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.doneBtn]}
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
            <Ionicons name="chevron-back" size={22} color={colors.text} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.logoWrap}>
            <RotaryWheel size={64} color={colors.primary} style={{ marginBottom: 12 }} />
            <Text style={styles.title}>Reset your password</Text>
            <Text style={styles.subtitle}>
              {phase === 'request'
                ? 'Enter your username and we\'ll send a reset code to the email on your account.'
                : 'Enter the code we emailed you and choose a new password.'}
            </Text>
          </View>

          {error ? (
            <View style={styles.banner}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <View style={[styles.banner, styles.noticeBanner]}>
              <Ionicons name="mail-outline" size={16} color={colors.primary} />
              <Text style={[styles.bannerText, { color: colors.primary }]}>{notice}</Text>
            </View>
          ) : null}

          {phase === 'request' ? (
            <>
              <Text style={styles.fieldLabel}>Username</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="your username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={sendCode}
              />
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
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
              <View style={styles.sentToRow}>
                <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                <Text style={styles.sentToText}>
                  Code sent to <Text style={styles.sentToEmail}>{maskEmail(resolvedEmail)}</Text>
                </Text>
              </View>

              <Text style={styles.fieldLabel}>Reset Code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoCapitalize="none"
                maxLength={10}
                onFocus={onInputFocus}
              />

              <Text style={styles.fieldLabel}>New Password</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={styles.passwordInput}
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="At least 6 characters"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  onFocus={onInputFocus}
                />
                <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPw}
                onChangeText={setConfirmPw}
                placeholder="Re-enter new password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPw}
                autoCapitalize="none"
                onSubmitEditing={submitReset}
                onFocus={onInputFocus}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.btnDisabled]}
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
                <Text style={[styles.resendText, (cooldown > 0 || loading) && { color: colors.textMuted }]}>
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
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  logoWrap: { alignItems: 'center', marginTop: 8, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: 'center', paddingHorizontal: 12, lineHeight: 18 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginBottom: 12 },
  noticeBanner: { backgroundColor: '#FDF2F7' },
  bannerText: { flex: 1, fontSize: 13, color: colors.danger, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: colors.surface, color: colors.text },
  sentToRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4 },
  sentToText: { flex: 1, fontSize: 13, color: colors.textMuted },
  sentToEmail: { color: colors.text, fontWeight: '700' },
  passwordWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, paddingRight: 14 },
  passwordInput: { flex: 1, padding: 14, fontSize: 16, color: colors.text },
  eyeBtn: { padding: 4 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 14, marginTop: 24 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.7 },
  resendBtn: { marginTop: 18, alignItems: 'center' },
  resendText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  doneWrap: { alignItems: 'center', paddingTop: 48 },
  doneIconWrap: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.success + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  doneBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 10, lineHeight: 20, paddingHorizontal: 12 },
  // Full-width button in the centered success view (otherwise it shrinks to the
  // text width and looks undersized next to the form buttons in other phases).
  doneBtn: { alignSelf: 'stretch', marginTop: 28 },
});
