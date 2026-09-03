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
import { KeyboardAwareScrollView, KeyboardAwareScrollHandle, useKeyboardAwareFocus } from '../../components/KeyboardAwareScrollView';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailVerification'>;

const RESEND_COOLDOWN = 60; // seconds; client guard on top of Supabase's rate limit

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { confirmEmailVerification, resendVerificationEmail } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  const email = route.params.email;

  const [code, setCode] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const kavRef = useRef<KeyboardAwareScrollHandle>(null);
  const onInputFocus = useKeyboardAwareFocus(kavRef);

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

  useEffect(() => { startCooldown(); return () => { if (timer.current) clearInterval(timer.current); }; }, []);

  const verify = async () => {
    setError(null); setNotice(null);
    if (!code.trim()) { setError('Enter the 6-digit code from the email.'); return; }
    setLoading(true);
    const { error: verifyError } = await confirmEmailVerification(code);
    setLoading(false);
    // On success the user is signed in and the app switches to the main stack
    // automatically; nothing more to do here.
    if (verifyError) setError(verifyError);
  };

  const resend = async () => {
    if (cooldown > 0 || loading) return;
    setError(null); setNotice(null);
    const { error: resendError } = await resendVerificationEmail();
    if (resendError) { setError(resendError); return; }
    setNotice('A new verification code is on its way. Check your inbox (and spam).');
    startCooldown();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
      <KeyboardAwareScrollView ref={kavRef} contentContainerStyle={styles.container}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={22} color={themeColors.text} />
            <Text style={[styles.backText, { color: themeColors.text }]}>Back</Text>
          </TouchableOpacity>

          <View style={[styles.iconWrap, { backgroundColor: isNightMode ? themeColors.surface : '#FDF2F7' }]}>
            <Ionicons name="mail-open-outline" size={48} color={themeColors.primary} />
          </View>
          <Text style={[styles.title, { color: themeColors.text }]}>Verify your email</Text>
          <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>
            We sent a 6-digit code to{'\n'}
            <Text style={[styles.email, { color: themeColors.primary }]}>{email}</Text>
          </Text>
          <Text style={[styles.hint, { color: themeColors.textMuted }]}>
            Enter it below to activate your account. Verification is required before you can use Rotaract Connect.
          </Text>

          {error ? (
            <View style={[styles.banner, { backgroundColor: isNightMode ? themeColors.cardBg : '#FEF2F2', borderColor: themeColors.danger, borderWidth: isNightMode ? 1 : 0 }]}>
              <Ionicons name="alert-circle" size={16} color={themeColors.danger} />
              <Text style={[styles.bannerText, { color: themeColors.danger }]}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <View style={[styles.banner, { backgroundColor: isNightMode ? themeColors.cardBg : '#ECFDF5', borderColor: themeColors.success, borderWidth: isNightMode ? 1 : 0 }]}>
              <Ionicons name="checkmark-circle" size={16} color={themeColors.success} />
              <Text style={[styles.bannerText, { color: themeColors.success }]}>{notice}</Text>
            </View>
          ) : null}

          <Text style={[styles.fieldLabel, { color: themeColors.primary }]}>Verification Code</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
              isFocused && { borderColor: themeColors.primary, borderWidth: 1.5 },
            ]}
            value={code}
            onChangeText={setCode}
            placeholder="6-digit code"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="number-pad"
            autoCapitalize="none"
            maxLength={10}
            onFocus={() => {
              setIsFocused(true);
              onInputFocus();
            }}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={verify}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColors.primary }, loading && styles.btnDisabled]}
            onPress={verify}
            activeOpacity={0.85}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="shield-checkmark" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Verify & Continue</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.resendBtn} onPress={resend} disabled={cooldown > 0 || loading}>
            <Text style={[styles.resendText, { color: themeColors.primary }, (cooldown > 0 || loading) && { color: themeColors.textMuted }]}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Didn\'t get it? Resend code'}
            </Text>
          </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 15, fontWeight: '600' },
  iconWrap: { alignSelf: 'center', width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 },
  email: { fontWeight: '700' },
  hint: { fontSize: 12.5, marginTop: 10, textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginTop: 16 },
  noticeBanner: {},
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  fieldLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8, marginTop: 20 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 18, letterSpacing: 2, textAlign: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginTop: 24 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.7 },
  resendBtn: { marginTop: 18, alignItems: 'center' },
  resendText: { fontSize: 14, fontWeight: '700' },
});
