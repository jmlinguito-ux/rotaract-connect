import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CompleteEvent'>;

export default function CompleteEventScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { events, impactFor, saveImpact } = useData();
  const event = events.find(e => e.id === eventId);
  const existingImpact = impactFor(eventId);

  const [hours, setHours] = useState(existingImpact?.volunteer_hours.toString() || '');
  const [beneficiaries, setBeneficiaries] = useState(existingImpact?.beneficiaries.toString() || '');
  const [funds, setFunds] = useState(existingImpact?.funds_raised.toString() || '');
  const [items, setItems] = useState(existingImpact?.items_distributed.toString() || '');
  const [trees, setTrees] = useState(existingImpact?.trees_planted.toString() || '0');
  const [summary, setSummary] = useState(existingImpact?.impact_summary || '');

  if (!event) return <Text style={{ padding: 20 }}>Event not found.</Text>;

  const handleSave = () => {
    // Completing early would release scoreboard points for an event that never ran.
    if (Date.now() < new Date(event.end_datetime).getTime()) {
      Alert.alert('Event Not Over Yet', 'Impact can only be recorded after the event has ended.');
      return;
    }
    saveImpact({
      event_id: eventId,
      volunteer_hours: parseFloat(hours) || 0,
      beneficiaries: parseInt(beneficiaries, 10) || 0,
      funds_raised: parseFloat(funds) || 0,
      items_distributed: parseInt(items, 10) || 0,
      trees_planted: parseInt(trees, 10) || 0,
      impact_summary: summary,
    });
    Alert.alert('Impact Recorded', 'The event status was set to COMPLETED and impact data recorded.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets={true}
        >
          <View style={styles.headerBox}>
            <Ionicons name="ribbon" size={32} color={colors.primary} />
            <Text style={styles.headerTitle}>Record Event Impact</Text>
            <Text style={styles.headerSub}>{event.title}</Text>
          </View>

          <View style={styles.formGroup}>
            <Field label="Total Volunteer Hours" value={hours} onChangeText={setHours} keyboardType="numeric" icon="time-outline" />
            <Field label="Beneficiaries Served" value={beneficiaries} onChangeText={setBeneficiaries} keyboardType="numeric" icon="people-outline" />
            <Field label="Funds Raised (PHP)" value={funds} onChangeText={setFunds} keyboardType="numeric" icon="cash-outline" />
            <Field label="Items Distributed" value={items} onChangeText={setItems} keyboardType="numeric" icon="gift-outline" />
            <Field label="Trees Planted / Eco Units" value={trees} onChangeText={setTrees} keyboardType="numeric" icon="leaf-outline" />
            <Field
              label="Impact Summary & Highlights"
              value={summary}
              onChangeText={setSummary}
              placeholder="Brief summary of the outcome..."
              multiline
              numberOfLines={4}
              icon="document-text-outline"
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Ionicons name="checkmark-done" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Save & Complete Event</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, icon, ...rest }: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputBox, rest.multiline && { alignItems: 'flex-start' }]}>
        {icon && <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginTop: rest.multiline ? 10 : 0 }} />}
        <TextInput
          style={[styles.input, rest.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
          placeholderTextColor={colors.textMuted}
          onFocus={(e: any) => {
            if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
            rest.onFocus?.(e);
          }}
          {...rest}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, paddingBottom: 40 },
  headerBox: { alignItems: 'center', backgroundColor: '#FDF2F7', padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#F9D6E5' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 8 },
  headerSub: { fontSize: 13, color: colors.primary, fontWeight: '600', marginTop: 2 },
  formGroup: { gap: 14 },
  fieldWrap: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.surface },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.text },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, padding: 16, borderRadius: 14, marginTop: 28 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
