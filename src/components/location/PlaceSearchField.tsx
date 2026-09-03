import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { PlaceSuggestion, searchPlaces, DISTRICT_3800_PRESET_VENUES } from '../../services/placeSearch';
import { LocationValue, styles } from './shared';

const DEBOUNCE_MS = 300;

export function PlaceSearchField({
  address,
  onSelect,
}: {
  /** Currently resolved location name, whatever set it. */
  address: string;
  onSelect: (value: Omit<LocationValue, never>) => void;
}) {
  const { colors: themeColors } = useTheme();
  const [query, setQuery] = useState(address);
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [selectedCityFilter, setSelectedCityFilter] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const appliedAddress = useRef(address);

  // Mirror locations set elsewhere — tapping the map or dragging the pin
  // reverse-geocodes to a name, and the field should show it. Marked dismissed
  // so filling the box doesn't immediately fire a fresh search for it.
  useEffect(() => {
    if (!address || address === appliedAddress.current) return;
    appliedAddress.current = address;
    setQuery(address);
    setDismissed(true);
    setResults([]);
  }, [address]);

  useEffect(() => {
    const q = query.trim();
    if (dismissed || q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const found = await searchPlaces(q, controller.signal);
        if (!controller.signal.aborted) {
          setResults(found);
          if (found.length === 0) setError(`No venue found for "${q}".`);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError('Search unavailable. Check your connection, or set the location manually.');
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, dismissed]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const choose = (place: PlaceSuggestion) => {
    onSelect({
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
      city: place.city,
    });
    appliedAddress.current = place.address;
    setQuery(place.address);
    setDismissed(true);
    setResults([]);
  };

  const cities = ['All D3800', 'Valenzuela', 'Caloocan', 'Mandaluyong', 'Marikina', 'Pasig', 'San Juan', 'Malabon', 'Navotas', 'Rizal'];

  const filteredPresets = selectedCityFilter && selectedCityFilter !== 'All D3800'
    ? DISTRICT_3800_PRESET_VENUES.filter(p => {
        if (selectedCityFilter === 'Rizal') {
          return ['Antipolo', 'San Mateo', 'Cainta', 'Taytay', 'Angono', 'Binangonan', 'Rodriguez', 'Morong', 'Tanay'].includes(p.city);
        }
        return p.city.toLowerCase() === selectedCityFilter.toLowerCase();
      })
    : DISTRICT_3800_PRESET_VENUES.slice(0, 10);

  return (
    <>
      <Text style={[styles.label, { color: themeColors.text }]}>Venue</Text>

      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.input,
            styles.searchInput,
            { backgroundColor: themeColors.surface, borderColor: themeColors.border, color: themeColors.text },
            focused && { borderColor: themeColors.primary, borderWidth: 1.5 },
          ]}
          value={query}
          onChangeText={text => {
            setQuery(text);
            setDismissed(false);
          }}
          onFocus={(e: any) => {
            setFocused(true);
            if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
          }}
          onBlur={() => setFocused(false)}
          placeholder="Search venue"
          placeholderTextColor={themeColors.textMuted}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator style={styles.searchSpinner} color={themeColors.primary} />}
      </View>

      {results.length > 0 && (
        <View style={[styles.suggestions, { backgroundColor: themeColors.cardBg, borderColor: themeColors.border }]}>
          {results.map((place, i) => (
            <TouchableOpacity
              key={place.id}
              style={[styles.suggestion, i > 0 && [styles.suggestionDivider, { borderTopColor: themeColors.border }]]}
              onPress={() => choose(place)}
              accessibilityRole="button"
              accessibilityLabel={place.label}
            >
              <Ionicons name="location-outline" size={16} color={themeColors.primary} />
              <View style={{ flex: 1 }}>
                <View style={localStyles.suggestionHeaderRow}>
                  <Text style={[styles.suggestionTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {place.address}
                  </Text>
                  {place.city ? (
                    <View style={[localStyles.cityBadge, { backgroundColor: themeColors.primary + '14' }]}>
                      <Text style={[localStyles.cityBadgeText, { color: themeColors.primary }]}>{place.city}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.suggestionSub, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {place.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {error ? <Text style={[styles.error, { color: themeColors.danger }]}>{error}</Text> : null}
    </>
  );
}

const localStyles = StyleSheet.create({
  suggestionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

