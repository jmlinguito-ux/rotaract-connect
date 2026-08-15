import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { PlaceSuggestion, searchPlaces } from '../../services/placeSearch';
import { LocationValue, styles } from './shared';

const DEBOUNCE_MS = 400;

export function PlaceSearchField({
  address,
  onSelect,
}: {
  /** Currently resolved location name, whatever set it. */
  address: string;
  onSelect: (value: Omit<LocationValue, never>) => void;
}) {
  const [query, setQuery] = useState(address);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

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
    if (dismissed || q.length < 3) {
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
          if (found.length === 0) setError(`No match for "${q}".`);
        }
      } catch (e) {
        // An aborted request was superseded by a newer keystroke — not an error.
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

  return (
    <>
      <Text style={styles.label}>Venue</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={[styles.input, styles.searchInput]}
          value={query}
          onChangeText={text => {
            setQuery(text);
            setDismissed(false);
          }}
          onFocus={(e: any) => {
            if (Platform.OS === 'web' && e?.target?.scrollIntoView) {
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 100);
            }
          }}
          placeholder="Type to search location"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
        {loading && <ActivityIndicator style={styles.searchSpinner} color={colors.primary} />}
      </View>

      {results.length > 0 && (
        <View style={styles.suggestions}>
          {results.map((place, i) => (
            <TouchableOpacity
              key={place.id}
              style={[styles.suggestion, i > 0 && styles.suggestionDivider]}
              onPress={() => choose(place)}
              accessibilityRole="button"
              accessibilityLabel={place.label}
            >
              <Ionicons name="location-outline" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>
                  {place.address}
                </Text>
                <Text style={styles.suggestionSub} numberOfLines={1}>
                  {place.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );
}
