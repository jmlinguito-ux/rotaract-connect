import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function VerificationPendingScreen() {
  const { signOut } = useAuth();
  const { colors: themeColors, isNightMode } = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]}>
      <View style={styles.container}>
        <View style={[styles.iconWrap, { backgroundColor: isNightMode ? themeColors.surface : '#FDF2F7' }]}>
          <Ionicons name="hourglass-outline" size={56} color={themeColors.primary} />
        </View>
        <Text style={[styles.title, { color: themeColors.text }]}>Awaiting Club Validation</Text>
        <Text style={[styles.body, { color: themeColors.textMuted }]}>
          Your Rotaract membership is currently being validated by your Club President. Your Club President will review your registration before it is sent to the App Administrator for final verification.
        </Text>

        <View style={styles.steps}>
          <Step label="Submitted" done themeColors={themeColors} />
          <Step label="Club President review" active themeColors={themeColors} />
          <Step label="App Admin final verification" themeColors={themeColors} />
          <Step label="Verified" last themeColors={themeColors} />
        </View>

        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColors.primary }]} onPress={signOut}>
          <Text style={styles.primaryBtnText}>Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Step({
  label,
  done,
  active,
  last,
  themeColors,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
  last?: boolean;
  themeColors: any;
}) {
  const color = done ? themeColors.success : active ? themeColors.primary : themeColors.border;
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepDotCol}>
        <View style={[styles.dot, { backgroundColor: color }]}>
          {done && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
        {!last && <View style={[styles.line, { backgroundColor: color }]} />}
      </View>
      <Text
        style={[
          styles.stepText,
          { color: themeColors.text },
          active && { color: themeColors.primary, fontWeight: '700' },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  iconWrap: { alignSelf: 'center', width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  steps: { marginTop: 32, marginBottom: 32 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepDotCol: { alignItems: 'center', width: 24, marginRight: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, minHeight: 24, marginVertical: 2 },
  stepText: { fontSize: 15, paddingTop: 1, paddingBottom: 20 },
  primaryBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  secondaryBtnText: { fontSize: 14 },
});
