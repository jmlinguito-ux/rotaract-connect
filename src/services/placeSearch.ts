import { Platform } from 'react-native';

export type PlaceSuggestion = {
  id: string;
  /** Full human-readable line shown in the dropdown. */
  label: string;
  /** Venue / street portion, used to fill Address. */
  address: string;
  city: string;
  latitude: number;
  longitude: number;
};

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

// District 3800 is in the Philippines — biasing results keeps the list relevant.
const COUNTRY_CODES = 'ph';

type NominatimResult = {
  place_id: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

function cityOf(address: Record<string, string> | undefined): string {
  if (!address) return '';
  return (
    address.city ||
    address.town ||
    address.municipality ||
    address.village ||
    address.suburb ||
    address.county ||
    ''
  );
}

function addressOf(result: NominatimResult): string {
  if (result.name) return result.name;
  // display_name is comma-separated from most to least specific.
  return result.display_name.split(',')[0]?.trim() ?? '';
}

/**
 * Look up places by free text. Returns [] for short queries rather than
 * hammering the service on every keystroke.
 *
 * Nominatim is free and keyless but rate-limited to roughly one request per
 * second, so callers must debounce. Swap this module for Google Places if the
 * app outgrows that budget.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url =
    `${ENDPOINT}?format=jsonv2&addressdetails=1&limit=6` +
    `&countrycodes=${COUNTRY_CODES}&q=${encodeURIComponent(q)}`;

  // Nominatim's policy requires an identifying User-Agent. Browsers forbid
  // setting it, and send their own plus a Referer, which satisfies the policy.
  const headers: Record<string, string> =
    Platform.OS === 'web' ? {} : { 'User-Agent': 'RotaractConnect/1.0 (district 3800 events app)' };

  const response = await fetch(url, { headers, signal });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);

  const results: NominatimResult[] = await response.json();

  return results.map(result => ({
    id: String(result.place_id),
    label: result.display_name,
    address: addressOf(result),
    city: cityOf(result.address),
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
  }));
}
