import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { zones } from '../../data/mockData';
import { useData } from '../../context/DataContext';
import { Ionicons } from '@expo/vector-icons';

type Props = NativeStackScreenProps<AuthStackParamList, 'ClubSelect'>;

export default function ClubSelectScreen({ navigation, route }: Props) {
  const { colors: themeColors } = useTheme();
  const [query, setQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  // Clubs come from the data layer so clubs added by a district admin show up here.
  const { clubs } = useData();

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return clubs;
    return clubs.filter(c =>
      c.club_name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.club_code.toLowerCase().includes(q)
    );
  }, [query, clubs]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.bg }]} edges={['top', 'bottom']}>
      {/* Top Navigation Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('Register');
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={22} color={themeColors.primary} />
          <Text style={[styles.backBtnText, { color: themeColors.primary }]}>Register</Text>
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: themeColors.text }]}>Select Club</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: themeColors.surface, borderColor: isSearchFocused ? themeColors.primary : themeColors.border }, isSearchFocused && { borderWidth: 1.5 }]}>
        <Ionicons name="search" size={18} color={isSearchFocused ? themeColors.primary : themeColors.textMuted} />
        <TextInput
          style={[styles.search, { color: themeColors.text }]}
          placeholder="Search clubs, cities…"
          placeholderTextColor={themeColors.textMuted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setIsSearchFocused(false)}
          autoFocus
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const zone = zones.find(z => z.id === item.zone_id);
          return (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: themeColors.cardBg }]}
              onPress={() => {
                route.params?.onSelect?.(item.id);
                navigation.goBack();
              }}
            >
              <View style={styles.rowMain}>
                <Text style={[styles.name, { color: themeColors.text }]}>{item.club_name}</Text>
                <Text style={[styles.meta, { color: themeColors.textMuted }]}>{zone?.zone_name} • {item.city}, {item.province}</Text>
                <Text style={[styles.metaSmall, { color: themeColors.textMuted }]}>{item.club_code}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: themeColors.border }]} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={<Text style={[styles.empty, { color: themeColors.textMuted }]}>No clubs match your search.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 70,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: 1 },
  search: { flex: 1, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowMain: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  metaSmall: { fontSize: 11, marginTop: 2 },
  sep: { height: 1, marginLeft: 16 },
  empty: { textAlign: 'center', marginTop: 40 },
});
