import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { AllocationMode } from '../types';
import { describeAllocationMode } from '../utils/clubAllocation';

export interface ClubAllocationValue {
  mode: AllocationMode;
  /** Slots each club gets by default, as raw text so the field can be cleared. */
  defaultSlots: string;
  /** Hours before the event start when unused SOFT slots are released. */
  releaseHoursBefore: number;
}

interface Props {
  value: ClubAllocationValue;
  onChange: (next: ClubAllocationValue) => void;
}

const MODES: { key: AllocationMode; label: string }[] = [
  { key: 'NONE', label: 'None' },
  { key: 'SOFT', label: 'Soft' },
  { key: 'HARD', label: 'Hard' },
];

const RELEASE_CHOICES = [12, 24, 48, 72];

/**
 * Club allocation settings, shared by Create and Edit Event so the two screens
 * cannot drift apart. Release timing is expressed as hours-before-start rather
 * than an absolute date so it stays correct if the organizer moves the event.
 */
export default function ClubAllocationFields({ value, onChange }: Props) {
  const { colors: themeColors } = useTheme();
  const set = (patch: Partial<ClubAllocationValue>) => onChange({ ...value, ...patch });

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: themeColors.text }]}>Club Participant Allocation</Text>

      <View style={styles.row}>
        {MODES.map(m => {
          const active = value.mode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              onPress={() => set({ mode: m.key })}
              style={[
                styles.chip,
                { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                active && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#FFF' : themeColors.text }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.hint, { color: themeColors.textMuted }]}>
        {describeAllocationMode(value.mode)}
        {value.mode === 'SOFT' ? ' Recommended.' : ''}
      </Text>

      {value.mode !== 'NONE' && (
        <View style={styles.fieldBlock}>
          <Text style={[styles.label, { color: themeColors.text }]}>Initial Slots Per Club</Text>
          <TextInput
            style={[styles.input, {
              backgroundColor: themeColors.surface,
              borderColor: themeColors.border,
              color: themeColors.text,
            }]}
            value={value.defaultSlots}
            onChangeText={t => set({ defaultSlots: t.replace(/[^0-9]/g, '') })}
            keyboardType="number-pad"
            placeholder="5"
            placeholderTextColor={themeColors.textMuted}
          />
          <Text style={[styles.hint, { color: themeColors.textMuted }]}>
            Each club can register this many participants. You can raise a specific
            club's limit later from the event's Club Allocation screen.
          </Text>
        </View>
      )}

      {value.mode === 'SOFT' && (
        <View style={styles.fieldBlock}>
          <Text style={[styles.label, { color: themeColors.text }]}>Release Unused Slots</Text>
          <View style={styles.row}>
            {RELEASE_CHOICES.map(hrs => {
              const active = value.releaseHoursBefore === hrs;
              return (
                <TouchableOpacity
                  key={hrs}
                  onPress={() => set({ releaseHoursBefore: hrs })}
                  style={[
                    styles.chip,
                    { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                    active && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFF' : themeColors.text }]}>
                    {hrs}h before
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: themeColors.textMuted }]}>
            Slots clubs have not used by then return to the general pool, so any
            eligible club can take them.
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Converts the form value into the event columns. `startISO` anchors the
 * release deadline relative to the event start.
 */
export function allocationFieldsToEvent(value: ClubAllocationValue, startISO: string) {
  if (value.mode === 'NONE') {
    return {
      allocation_mode: 'NONE' as AllocationMode,
      default_club_allocation: undefined,
      allocation_release_at: undefined,
    };
  }
  const slots = parseInt(value.defaultSlots, 10);
  const releaseAt =
    value.mode === 'SOFT' && startISO
      ? new Date(new Date(startISO).getTime() - value.releaseHoursBefore * 3600_000).toISOString()
      : undefined;
  return {
    allocation_mode: value.mode,
    default_club_allocation: Number.isFinite(slots) && slots >= 0 ? slots : 5,
    allocation_release_at: releaseAt,
  };
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 4, marginTop: 2 },
  row: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 11.5, fontWeight: '700' },
  hint: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  fieldBlock: { marginTop: 4, gap: 4 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
});
