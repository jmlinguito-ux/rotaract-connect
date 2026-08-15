import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { AreaOfFocus } from '../types';
import { AREAS_OF_FOCUS } from '../data/areasOfFocus';

/**
 * Collapsed by default so it doesn't dominate the form; expands into a
 * checkbox list. Multi-select — a project can serve several areas.
 */
export function AreasOfFocusPicker({
  selected,
  onChange,
}: {
  selected: AreaOfFocus[];
  onChange: (next: AreaOfFocus[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (key: AreaOfFocus) => {
    onChange(selected.includes(key) ? selected.filter(a => a !== key) : [...selected, key]);
  };

  const summary =
    selected.length === 0
      ? 'Select areas of focus'
      : `${selected.length} selected`;

  return (
    <>
      <Text style={styles.label}>Areas of Focus</Text>

      <TouchableOpacity
        style={[styles.trigger, open && styles.triggerOpen]}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Areas of focus"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.triggerContentWrap}>
          {selected.length === 0 ? (
            <Text style={styles.triggerPlaceholder}>Select areas of focus</Text>
          ) : (
            <View style={styles.insidePillsWrap}>
              {selected.map(key => {
                const area = AREAS_OF_FOCUS.find(a => a.key === key);
                if (!area) return null;
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.insideChip}
                    onPress={e => {
                      e.stopPropagation();
                      toggle(key);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${area.label}`}
                  >
                    <Text style={styles.insideChipText}>{area.label}</Text>
                    <Ionicons name="close" size={13} color={colors.primary} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {open && (
        <View style={styles.dropdownWrap}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View style={styles.menu}>
            {AREAS_OF_FOCUS.map((area, i) => {
              const isSelected = selected.includes(area.key);
              return (
                <TouchableOpacity
                  key={area.key}
                  style={[styles.option, i > 0 && styles.optionDivider]}
                  onPress={() => toggle(area.key)}
                  accessibilityRole="button"
                  accessibilityLabel={area.label}
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
                    {isSelected && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <Ionicons name={area.icon} size={16} color={isSelected ? colors.primary : colors.textMuted} />
                  <Text style={[styles.optionText, isSelected && styles.optionTextOn]}>{area.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 14, marginBottom: 6 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 52,
    backgroundColor: colors.surface,
  },
  triggerOpen: { borderColor: colors.primary },
  triggerContentWrap: { flex: 1, marginRight: 8 },
  triggerPlaceholder: { fontSize: 14, color: colors.textMuted },
  insidePillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  insideChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary + '14',
  },
  insideChipText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  dropdownWrap: { position: 'relative', zIndex: 100 },
  backdrop: {
    position: 'absolute',
    top: -2000,
    bottom: -2000,
    left: -2000,
    right: -2000,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  menu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bg,
    overflow: 'hidden',
    zIndex: 2,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  optionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { flex: 1, fontSize: 13, color: colors.text },
  optionTextOn: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: colors.primary + '14',
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  chipText: { fontSize: 11, fontWeight: '700', color: colors.primary },
});
