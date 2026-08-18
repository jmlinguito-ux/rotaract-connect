import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, NativeSyntheticEvent, TextInputKeyPressEventData, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

interface SegmentedTimeInputProps {
  label: string;
  value: Date | null;
  baseDate: Date;
  onChangeTime: (date: Date) => void;
  onOpenPicker: () => void;
  error?: string | null;
}

export function SegmentedTimeInput({ label, value, baseDate, onChangeTime, onOpenPicker, error }: SegmentedTimeInputProps) {
  const { colors: themeColors, isNightMode } = useTheme();
  const [focusedSegment, setFocusedSegment] = useState<'hour' | 'minute' | 'period' | null>(null);
  const [digitBuffer, setDigitBuffer] = useState<string>('');
  const inputRef = useRef<TextInput>(null);

  // Extract current time parts from Date object or default to '--' if null
  let strHours = '--';
  let strMinutes = '--';
  let periodStr = '--';

  let hours12 = 9;
  let minutes = 0;
  let period: 'AM' | 'PM' = 'AM';

  if (value) {
    const hours24 = value.getHours();
    minutes = value.getMinutes();
    period = hours24 >= 12 ? 'PM' : 'AM';
    hours12 = hours24 % 12;
    hours12 = hours12 ? hours12 : 12;

    strHours = hours12 < 10 ? `0${hours12}` : `${hours12}`;
    strMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
    periodStr = period;
  }

  const updateTime = (h12: number, m: number, p: 'AM' | 'PM') => {
    let h24 = h12;
    if (p === 'PM' && h12 < 12) h24 += 12;
    if (p === 'AM' && h12 === 12) h24 = 0;

    const updated = new Date(baseDate);
    updated.setHours(h24, m, 0, 0);
    onChangeTime(updated);
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = e.nativeEvent.key;

    if (key === 'ArrowRight' || key === 'Tab') {
      if (focusedSegment === 'hour') {
        setFocusedSegment('minute');
        setDigitBuffer('');
      } else if (focusedSegment === 'minute') {
        setFocusedSegment('period');
        setDigitBuffer('');
      }
    } else if (key === 'ArrowLeft') {
      if (focusedSegment === 'period') {
        setFocusedSegment('minute');
        setDigitBuffer('');
      } else if (focusedSegment === 'minute') {
        setFocusedSegment('hour');
        setDigitBuffer('');
      }
    } else if (key === 'ArrowUp') {
      stepSegment(1);
    } else if (key === 'ArrowDown') {
      stepSegment(-1);
    } else if (key === 'Backspace') {
      if (focusedSegment === 'period') {
        setFocusedSegment('minute');
        setDigitBuffer('');
      } else if (focusedSegment === 'minute') {
        setFocusedSegment('hour');
        setDigitBuffer('');
      }
    }
  };

  const stepSegment = (delta: number) => {
    if (focusedSegment === 'hour') {
      let nextH = (value ? hours12 : 9) + delta;
      if (nextH > 12) nextH = 1;
      if (nextH < 1) nextH = 12;
      updateTime(nextH, value ? minutes : 0, value ? period : 'AM');
    } else if (focusedSegment === 'minute') {
      let nextM = (value ? minutes : 0) + delta;
      if (nextM > 59) nextM = 0;
      if (nextM < 0) nextM = 59;
      updateTime(value ? hours12 : 9, nextM, value ? period : 'AM');
    } else if (focusedSegment === 'period') {
      const nextP = (value ? period : 'AM') === 'AM' ? 'PM' : 'AM';
      updateTime(value ? hours12 : 9, value ? minutes : 0, nextP);
    }
  };

  const handleTextChange = (text: string) => {
    const char = text.slice(-1).toUpperCase();
    if (!char) return;

    const curH = value ? hours12 : 9;
    const curM = value ? minutes : 0;
    const curP = value ? period : 'AM';

    if (focusedSegment === 'hour' || !focusedSegment) {
      if (/[0-9]/.test(char)) {
        if (digitBuffer === '') {
          const num = parseInt(char, 10);
          if (num > 1) {
            updateTime(num, curM, curP);
            setDigitBuffer('');
            setFocusedSegment('minute');
          } else {
            setDigitBuffer(char);
            updateTime(num === 0 ? 12 : num, curM, curP);
          }
        } else {
          const fullHour = parseInt(digitBuffer + char, 10);
          const validH = fullHour > 12 ? 12 : fullHour === 0 ? 12 : fullHour;
          updateTime(validH, curM, curP);
          setDigitBuffer('');
          setFocusedSegment('minute');
        }
      }
    } else if (focusedSegment === 'minute') {
      if (/[0-9]/.test(char)) {
        if (digitBuffer === '') {
          const num = parseInt(char, 10);
          if (num > 5) {
            updateTime(curH, num, curP);
            setDigitBuffer('');
            setFocusedSegment('period');
          } else {
            setDigitBuffer(char);
            updateTime(curH, num, curP);
          }
        } else {
          const fullMin = parseInt(digitBuffer + char, 10);
          const validM = fullMin > 59 ? 59 : fullMin;
          updateTime(curH, validM, curP);
          setDigitBuffer('');
          setFocusedSegment('period');
        }
      }
    } else if (focusedSegment === 'period') {
      if (char === 'A') {
        updateTime(curH, curM, 'AM');
      } else if (char === 'P') {
        updateTime(curH, curM, 'PM');
      }
    }
  };

  const selectSegment = (segment: 'hour' | 'minute' | 'period') => {
    setFocusedSegment(segment);
    setDigitBuffer('');
    inputRef.current?.focus();
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: themeColors.primary }]}>{label}</Text>

      <View style={[
        styles.inputCard,
        { backgroundColor: themeColors.surface, borderColor: themeColors.border },
        focusedSegment && [styles.inputCardFocused, { borderColor: themeColors.primary }],
      ]}>
        {/* Hidden TextInput for handling keyboard input and auto-advancing */}
        <TextInput
          ref={inputRef}
          style={styles.hiddenInput}
          value=""
          onChangeText={handleTextChange}
          onKeyPress={handleKeyPress}
          onFocus={(e: any) => {
            if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
          }}
          onBlur={() => {
            setFocusedSegment(null);
            setDigitBuffer('');
          }}
          keyboardType="default"
          caretHidden
        />

        {/* 3 Segments: Hour : Minute Period */}
        <View style={styles.segmentContainer}>
          {/* Hour Segment */}
          <TouchableOpacity
            style={[styles.segmentBox, focusedSegment === 'hour' && styles.activeBlueHighlight]}
            onPress={() => selectSegment('hour')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, { color: themeColors.text }, focusedSegment === 'hour' && styles.activeBlueText]}>
              {strHours}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.colonText, { color: themeColors.text }]}>:</Text>

          {/* Minute Segment */}
          <TouchableOpacity
            style={[styles.segmentBox, focusedSegment === 'minute' && styles.activeBlueHighlight]}
            onPress={() => selectSegment('minute')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, { color: themeColors.text }, focusedSegment === 'minute' && styles.activeBlueText]}>
              {strMinutes}
            </Text>
          </TouchableOpacity>

          <Text style={styles.spaceText}> </Text>

          {/* Period Segment (AM/PM) */}
          <TouchableOpacity
            style={[styles.segmentBox, focusedSegment === 'period' && styles.activeBlueHighlight]}
            onPress={() => selectSegment('period')}
            activeOpacity={0.7}
          >
            <Text style={[styles.segmentText, { color: themeColors.text }, focusedSegment === 'period' && styles.activeBlueText]}>
              {periodStr}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Clock Icon opens browser/native time picker modal */}
        <TouchableOpacity style={styles.clockIconBtn} onPress={onOpenPicker}>
          <Ionicons name="time-outline" size={18} color={themeColors.text} />
        </TouchableOpacity>
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
    marginTop: 12,
    marginBottom: 4,
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
    position: 'relative',
  },
  inputCardFocused: {
    borderColor: colors.primary,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.01,
    zIndex: 10,
  },
  segmentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentBox: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBlueHighlight: {
    backgroundColor: '#BFDBFE',
  },
  activeBlueText: {
    color: '#1E40AF',
    fontWeight: '600',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  colonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    marginHorizontal: 1,
  },
  spaceText: {
    fontSize: 15,
    marginHorizontal: 2,
  },
  clockIconBtn: {
    padding: 4,
    zIndex: 20,
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.danger,
    marginTop: 4,
  },
});
