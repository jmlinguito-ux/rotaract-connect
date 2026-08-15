import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface MaskedTimeInputProps {
  label: string;
  value: string;
  onChangeValue: (val: string, parsedDate: Date | null) => void;
  baseDate: Date;
  error?: string | null;
  required?: boolean;
}

export const formatTimeAMPM = (date: Date) => {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strHours = hours < 10 ? `0${hours}` : `${hours}`;
  const strMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${strHours}:${strMinutes} ${ampm}`;
};

export const parseTimeText = (text: string, baseDate: Date): Date | null => {
  const str = text.trim().toUpperCase();
  if (!str) return null;
  const isPM = str.includes('PM');
  const isAM = str.includes('AM');
  const clean = str.replace(/(AM|PM|\s)/g, '');
  const parts = clean.split(':');

  let hours = parseInt(parts[0], 10);
  let minutes = parts[1] ? parseInt(parts[1], 10) : 0;

  if (isNaN(hours) || hours < 0 || hours > 23) return null;
  if (isNaN(minutes) || minutes < 0 || minutes > 59) return null;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  const res = new Date(baseDate);
  res.setHours(hours, minutes, 0, 0);
  return res;
};

export function MaskedTimeInput({ label, value, onChangeValue, baseDate, error, required }: MaskedTimeInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleChangeText = (raw: string) => {
    let clean = raw.toUpperCase().replace(/[^0-9APM:]/g, '');

    // Auto add colon if 2 digits typed without colon
    if (/^\d{2}$/.test(clean) && !raw.endsWith(':')) {
      clean = clean + ':';
    }

    const parsed = parseTimeText(clean, baseDate);
    onChangeValue(clean, parsed);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label} {required && <Text style={{ color: colors.danger }}>*</Text>}
      </Text>

      <View style={[styles.inputCard, isFocused && styles.inputCardFocused]}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            const parsed = parseTimeText(value, baseDate);
            if (parsed) {
              onChangeValue(formatTimeAMPM(parsed), parsed);
            }
          }}
          placeholder="09:00 AM"
          placeholderTextColor={colors.textMuted}
          keyboardType="default"
          autoCapitalize="characters"
        />

        <Ionicons name="time-outline" size={18} color={colors.textMuted} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginTop: 14,
    marginBottom: 6,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    height: 48,
  },
  inputCardFocused: {
    borderColor: colors.primary,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: colors.text,
    padding: 0,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.danger,
    marginTop: 4,
  },
});
