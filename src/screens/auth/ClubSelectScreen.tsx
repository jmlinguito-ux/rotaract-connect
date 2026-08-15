import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { zones } from '../../data/mockData';
import { useData } from '../../context/DataContext';
import { Ionicons } from '@expo/vector-icons';

type Props = NativeStackScreenProps<AuthStackParamList, 'ClubSelect'>;

export default function ClubSelectScreen({ navigation, route }: Props) {
  const [query, setQuery] = useState('');
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={styles.backBtnText}>Register</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Select Club</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.search}
          placeholder="Search clubs, cities…"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
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
              style={styles.row}
              onPress={() => {
                route.params?.onSelect?.(item.id);
                navigation.goBack();
              }}
            >
              <View style={styles.rowMain}>
                <Text style={styles.name}>{item.club_name}</Text>
                <Text style={styles.meta}>{zone?.zone_name} • {item.city}, {item.province}</Text>
                <Text style={styles.metaSmall}>{item.club_code}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={<Text style={styles.empty}>No clubs match your search.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 70,
  },
  backBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  search: { flex: 1, fontSize: 16, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowMain: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  metaSmall: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: 16 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
