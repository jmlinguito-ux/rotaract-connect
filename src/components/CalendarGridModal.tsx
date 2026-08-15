import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface CalendarGridModalProps {
  visible: boolean;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onClose: () => void;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarGridModal({ visible, selectedDate, onSelectDate, onClose }: CalendarGridModalProps) {
  const [viewDate, setViewDate] = useState<Date>(selectedDate || new Date());

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const monthYearHeader = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  // Generate 42 grid cells (6 rows x 7 days)
  const cells: { day: number; isCurrentMonth: boolean; date: Date }[] = [];

  // Previous month padding
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const prevDay = daysInPrevMonth - i;
    cells.push({
      day: prevDay,
      isCurrentMonth: false,
      date: new Date(viewYear, viewMonth - 1, prevDay),
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      isCurrentMonth: true,
      date: new Date(viewYear, viewMonth, d),
    });
  }

  // Next month padding
  const remainingCells = 42 - cells.length;
  for (let n = 1; n <= remainingCells; n++) {
    cells.push({
      day: n,
      isCurrentMonth: false,
      date: new Date(viewYear, viewMonth + 1, n),
    });
  }

  const handlePrevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleSelect = (cellDate: Date) => {
    onSelectDate(cellDate);
    onClose();
  };

  const handleToday = () => {
    const today = new Date();
    setViewDate(today);
    onSelectDate(today);
    onClose();
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.calendarCard} activeOpacity={1}>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.monthSelectorBtn}>
              <Text style={styles.monthYearText}>{monthYearHeader}</Text>
              <Ionicons name="caret-down" size={14} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.navArrows}>
              <TouchableOpacity style={styles.arrowBtn} onPress={handlePrevMonth}>
                <Ionicons name="arrow-up" size={18} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.arrowBtn} onPress={handleNextMonth}>
                <Ionicons name="arrow-down" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Weekday Names Header Row */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w, idx) => (
              <Text key={idx} style={styles.weekdayText}>{w}</Text>
            ))}
          </View>

          {/* 7x6 Grid of Days */}
          <View style={styles.grid}>
            {cells.map((cell, index) => {
              const selected = isSameDay(cell.date, selectedDate);
              return (
                <TouchableOpacity
                  key={index}
                  style={[styles.dayCell, selected && styles.dayCellSelected]}
                  onPress={() => handleSelect(cell.date)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !cell.isCurrentMonth && styles.dayTextOtherMonth,
                      selected && styles.dayTextSelected,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Footer Link Actions */}
          <View style={styles.footerRow}>
            <TouchableOpacity onPress={() => onSelectDate(new Date())}>
              <Text style={styles.footerLinkText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleToday}>
              <Text style={styles.footerLinkText}>Today</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    width: 290,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthYearText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  navArrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  arrowBtn: {
    padding: 4,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekdayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  dayCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    marginVertical: 1,
  },
  dayCellSelected: {
    backgroundColor: '#007AFF',
    borderRadius: 6,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0F172A',
  },
  dayTextOtherMonth: {
    color: '#CBD5E1',
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  footerLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});
