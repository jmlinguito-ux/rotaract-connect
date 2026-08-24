import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export interface CohostingValue {
  enabled: boolean;
  /** Fee as pesos in raw text so the field can be cleared. Centavos happen at submit time. */
  feePesos: string;
  maxClubs: string;
  requiresApproval: boolean;
  benefits: string;
  /** Hours before start when cohosting applications close. */
  deadlineHoursBefore: number;
}

interface Props {
  value: CohostingValue;
  onChange: (next: CohostingValue) => void;
}

/**
 * Cohosting settings — shared by Create and Edit Event so the two screens
 * cannot drift. Application deadline is expressed as hours-before-start so it
 * moves correctly if the organizer reschedules the event.
 */
export default function CohostingFields({ value, onChange }: Props) {
  const { colors: themeColors } = useTheme();
  const set = (patch: Partial<CohostingValue>) => onChange({ ...value, ...patch });

  const DEADLINES = [24, 48, 72, 168];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: themeColors.text }]}>Cohosting</Text>
          <Text style={[styles.hint, { color: themeColors.textMuted }]}>
            Allow other Rotaract clubs to cohost and get automatic participant quotas
          </Text>
        </View>
        <Switch
          value={value.enabled}
          onValueChange={v => set({ enabled: v })}
          trackColor={{ false: themeColors.border, true: themeColors.primary + '80' }}
          thumbColor={value.enabled ? themeColors.primary : '#f4f3f4'}
        />
      </View>

      {value.enabled && (
        <View style={styles.fieldsContainer}>
          <View style={styles.fieldBlock}>
            <Text style={[styles.label, { color: themeColors.text }]}>Cohost Fee (PHP)</Text>
            <TextInput
              style={inputStyle(themeColors)}
              value={value.feePesos}
              onChangeText={t => set({ feePesos: t.replace(/[^0-9]/g, '') })}
              keyboardType="number-pad"
              placeholder="500"
              placeholderTextColor={themeColors.textMuted}
            />
            <Text style={[styles.hint, { color: themeColors.textMuted }]}>
              Enter 0 for free cohosting. Payment verification is handled manually.
            </Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.label, { color: themeColors.text }]}>Max Cohost Clubs</Text>
            <TextInput
              style={inputStyle(themeColors)}
              value={value.maxClubs}
              onChangeText={t => set({ maxClubs: t.replace(/[^0-9]/g, '') })}
              keyboardType="number-pad"
              placeholder="Leave blank for unlimited"
              placeholderTextColor={themeColors.textMuted}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.label, { color: themeColors.text }]}>Application Deadline</Text>
            <View style={styles.chipRow}>
              {DEADLINES.map(hrs => {
                const active = value.deadlineHoursBefore === hrs;
                return (
                  <TouchableOpacity
                    key={hrs}
                    onPress={() => set({ deadlineHoursBefore: hrs })}
                    style={[
                      styles.chip,
                      { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                      active && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? '#FFF' : themeColors.text }]}>
                      {hrs === 168 ? '1w before' : `${hrs}h before`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.headerRow, { marginTop: 4 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.label, { color: themeColors.text }]}>
                Require Organizer Approval
              </Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Review and approve each cohosting request before confirming
              </Text>
            </View>
            <Switch
              value={value.requiresApproval}
              onValueChange={v => set({ requiresApproval: v })}
              trackColor={{ false: themeColors.border, true: themeColors.primary + '80' }}
              thumbColor={value.requiresApproval ? themeColors.primary : '#f4f3f4'}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={[styles.label, { color: themeColors.text }]}>What's Included (Benefits)</Text>
            <TextInput
              style={[inputStyle(themeColors), { minHeight: 80, textAlignVertical: 'top' }]}
              value={value.benefits}
              onChangeText={t => set({ benefits: t })}
              multiline
              placeholder="Logo on event materials, 5 slots, certificate, event kit…"
              placeholderTextColor={themeColors.textMuted}
            />
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Converts the form value into event columns. `startISO` anchors the deadline
 * relative to the event start.
 */
export function cohostingFieldsToEvent(value: CohostingValue, startISO: string) {
  if (!value.enabled) {
    return {
      cohosting_enabled: false,
      cohosting_fee_centavos: 0,
      cohosting_max_clubs: undefined,
      cohosting_application_deadline: undefined,
      cohosting_requires_approval: true,
      cohosting_benefits: undefined,
    };
  }
  const feePesos = parseInt(value.feePesos, 10);
  const max = parseInt(value.maxClubs, 10);
  const deadline = startISO
    ? new Date(new Date(startISO).getTime() - value.deadlineHoursBefore * 3600_000).toISOString()
    : undefined;
  return {
    cohosting_enabled: true,
    cohosting_fee_centavos: Number.isFinite(feePesos) && feePesos >= 0 ? feePesos * 100 : 0,
    cohosting_max_clubs: Number.isFinite(max) && max > 0 ? max : undefined,
    cohosting_application_deadline: deadline,
    cohosting_requires_approval: value.requiresApproval,
    cohosting_benefits: value.benefits.trim() || undefined,
  };
}

const inputStyle = (t: { surface: string; border: string; text: string }) => ({
  backgroundColor: t.surface,
  borderColor: t.border,
  color: t.text,
  borderWidth: 1,
  borderRadius: 12,
  padding: 12,
  fontSize: 14,
});

const styles = StyleSheet.create({
  container: { gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  fieldsContainer: { gap: 8, marginTop: 4 },
  fieldBlock: { gap: 4 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  hint: { fontSize: 11, marginTop: 1, lineHeight: 15 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 11.5, fontWeight: '700' },
});
