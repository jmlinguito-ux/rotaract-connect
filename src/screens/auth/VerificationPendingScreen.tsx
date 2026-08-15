import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

export default function VerificationPendingScreen() {
  const { signOut, signInAs } = useAuth();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons name="hourglass-outline" size={56} color={colors.primary} />
        </View>
        <Text style={styles.title}>Awaiting Club Validation</Text>
        <Text style={styles.body}>
          Your Rotaract membership is currently being validated by your Club President. Your Club President will review your registration before it is sent to the App Administrator for final verification.
        </Text>

        <View style={styles.steps}>
          <Step label="Submitted" done />
          <Step label="Club President review" active />
          <Step label="App Admin final verification" />
          <Step label="Verified" last />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={() => signInAs('u_member')}>
          <Text style={styles.primaryBtnText}>Continue to app (demo)</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={signOut}>
          <Text style={styles.secondaryBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function Step({ label, done, active, last }: { label: string; done?: boolean; active?: boolean; last?: boolean }) {
  const color = done ? colors.success : active ? colors.primary : colors.border;
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepDotCol}>
        <View style={[styles.dot, { backgroundColor: color }]}>
          {done && <Ionicons name="checkmark" size={12} color="#fff" />}
        </View>
        {!last && <View style={[styles.line, { backgroundColor: color }]} />}
      </View>
      <Text style={[styles.stepText, active && { color: colors.primary, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  iconWrap: { alignSelf: 'center', width: 96, height: 96, borderRadius: 48, backgroundColor: '#FDF2F7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center', color: colors.text },
  body: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  steps: { marginTop: 32, marginBottom: 32 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepDotCol: { alignItems: 'center', width: 24, marginRight: 12 },
  dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, minHeight: 24, marginVertical: 2 },
  stepText: { fontSize: 15, color: colors.text, paddingTop: 1, paddingBottom: 20 },
  primaryBtn: { backgroundColor: colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { padding: 16, alignItems: 'center', marginTop: 8 },
  secondaryBtnText: { color: colors.textMuted, fontSize: 14 },
});
