import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import RotaryWheel from '../../components/RotaryWheel';
import { KeyboardAwareScrollView, useKeyboardAwareOnFocus } from '../../components/KeyboardAwareScrollView';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();
  const onFocusAware = useKeyboardAwareOnFocus();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email or username and password.');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.needsVerification && result.email) {
      // Account exists but the email isn't confirmed yet — send them to verify.
      navigation.navigate('EmailVerification', { email: result.email });
      return;
    }
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardTopMargin={32}
      >
        <View style={styles.innerContent}>
          <View style={styles.logoWrap}>
            <RotaryWheel size={84} color={themeColors.primary} style={styles.logo} />
            <Text style={[styles.title, { color: themeColors.text }]}>Rotaract Connect</Text>
            <Text style={[styles.subtitle, { color: themeColors.textMuted }]}>District 3800 • Verified Rotaractor Network</Text>
          </View>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: isNightMode ? themeColors.cardBg : '#FEF2F2', borderColor: colors.danger, borderWidth: isNightMode ? 1 : 0 }]}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorBannerText}>{error}</Text>
            </View>
          ) : null}

          <Text style={[styles.fieldLabel, { color: themeColors.primary }]}>Email or Username</Text>
          <TextInput
            style={[styles.input, { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text }]}
            value={email}
            onChangeText={setEmail}
            onFocus={onFocusAware}
            placeholder="you@example.com or username"
            placeholderTextColor={themeColors.textMuted}
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.fieldLabel, { color: themeColors.primary }]}>Password</Text>
          <View style={[styles.passwordWrap, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
            <TextInput
              style={[styles.passwordInput, { color: themeColors.text }]}
              value={password}
              onChangeText={setPassword}
              onFocus={onFocusAware}
              placeholder="••••••••"
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={themeColors.textMuted}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => navigation.navigate('ForgotPassword', { username: email.trim() && !email.includes('@') ? email.trim() : undefined })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.forgotText, { color: themeColors.primary }]}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.signInBtn, { backgroundColor: themeColors.primary }, loading && styles.signInBtnDisabled]}
            onPress={handleSignIn}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.signInBtnText}>Sign In</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.linkBtn}>
            <Text style={[styles.linkText, { color: themeColors.textMuted }]}>
              New Rotaractor? <Text style={[styles.linkTextBold, { color: themeColors.primary }]}>Create an account</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  innerContent: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  logoWrap: { alignItems: 'center', marginBottom: 24 },
  logo: { marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
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
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.primary, letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingRight: 14,
  },
  passwordInput: { flex: 1, padding: 14, fontSize: 16, color: colors.text },
  eyeBtn: { padding: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 12 },
  forgotText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  signInBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
  },
  signInBtnDisabled: { opacity: 0.7 },
  signInBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  linkBtn: { marginTop: 24, alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.textMuted, fontSize: 14 },
  linkTextBold: { color: colors.primary, fontWeight: '700' },
});
