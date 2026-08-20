import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { RootStackParamList } from '../../navigation/types';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { KeyboardAwareScrollView, useKeyboardAwareOnFocus } from '../../components/KeyboardAwareScrollView';

type Props = NativeStackScreenProps<RootStackParamList, 'CompleteEvent'>;

export default function CompleteEventScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const { events, impactFor, saveImpact } = useData();
  const { colors: themeColors, isNightMode } = useTheme();
  const event = events.find(e => e.id === eventId);
  const existingImpact = impactFor(eventId);

  const [hours, setHours] = useState(existingImpact?.volunteer_hours.toString() || '');
  const [beneficiaries, setBeneficiaries] = useState(existingImpact?.beneficiaries.toString() || '');
  const [funds, setFunds] = useState(existingImpact?.funds_raised.toString() || '');
  const [items, setItems] = useState(existingImpact?.items_distributed.toString() || '');
  const [trees, setTrees] = useState(existingImpact?.trees_planted.toString() || '0');
  const [summary, setSummary] = useState(existingImpact?.impact_summary || '');

  if (!event) return null;

  const handleSave = () => {
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
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardTopMargin={32}
      >
        <View style={[styles.headerBox, { backgroundColor: isNightMode ? themeColors.cardBg : '#FDF2F7', borderColor: isNightMode ? themeColors.border : '#F9D6E5' }]}>
          <Ionicons name="ribbon" size={32} color={themeColors.primary} />
          <Text style={[styles.headerTitle, { color: themeColors.text }]}>Record Event Impact</Text>
          <Text style={[styles.headerSub, { color: themeColors.primary }]}>{event.title}</Text>
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

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: themeColors.primary }]} onPress={handleSave}>
          <Ionicons name="checkmark-done" size={20} color="#fff" />
          <Text style={styles.saveBtnText}>Save & Complete Event</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Field({ label, icon, ...rest }: any) {
  const { colors: themeColors } = useTheme();
  const onFocusAware = useKeyboardAwareOnFocus();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: themeColors.text }]}>{label}</Text>
      <View
        style={[
          styles.inputBox,
          { backgroundColor: themeColors.surface, borderColor: themeColors.border },
          focused && { borderColor: themeColors.primary, borderWidth: 1.5 },
          rest.multiline && { alignItems: 'flex-start' },
        ]}
      >
        {icon && <Ionicons name={icon} size={18} color={focused ? themeColors.primary : themeColors.textMuted} style={{ marginTop: rest.multiline ? 10 : 0 }} />}
        <TextInput
          style={[styles.input, { color: themeColors.text }, rest.multiline && { minHeight: 80, textAlignVertical: 'top' }]}
          placeholderTextColor={themeColors.textMuted}
          onFocus={(e: any) => {
            setFocused(true);
            onFocusAware();
            if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
            rest.onFocus?.(e);
          }}
          onBlur={(e: any) => {
            setFocused(false);
            rest.onBlur?.(e);
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
