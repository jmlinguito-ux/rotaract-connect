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

// District 3800 Philippines bounding box:
// Covers Valenzuela, Caloocan, Malabon, Navotas, Marikina, Pasig, Mandaluyong, San Juan, and Rizal Province.
// min_lon=120.90, max_lat=14.85, max_lon=121.45, min_lat=14.30
const D3800_VIEWBOX = '120.90,14.85,121.45,14.30';
const COUNTRY_CODES = 'ph';

/**
 * Curated list of official District 3800 hubs, city halls, covered courts,
 * and sports complexes across CAMANAVA, Central Metro, and Rizal Province.
 */
export const DISTRICT_3800_PRESET_VENUES: PlaceSuggestion[] = [
  // 📍 Valenzuela
  {
    id: 'd3800_valenzuela_peoples_park',
    label: "Valenzuela People's Park Covered Court, MacArthur Hwy, Karuhatan, Valenzuela",
    address: "Valenzuela People's Park Covered Court",
    city: 'Valenzuela',
    latitude: 14.6937,
    longitude: 120.9658,
  },
  {
    id: 'd3800_valenzuela_city_hall',
    label: 'Valenzuela City Hall Activity Center, MacArthur Hwy, Valenzuela',
    address: 'Valenzuela City Hall Activity Center, MacArthur Hwy',
    city: 'Valenzuela',
    latitude: 14.6948,
    longitude: 120.9664,
  },
  {
    id: 'd3800_tullahan_malanday',
    label: 'Tullahan Riverbank, Brgy. Malanday, Valenzuela',
    address: 'Tullahan Riverbank, Brgy. Malanday',
    city: 'Valenzuela',
    latitude: 14.7105,
    longitude: 120.9650,
  },

  // 📍 Caloocan
  {
    id: 'd3800_caloocan_sports_complex',
    label: 'Caloocan Sports Complex, Bagumbong Rd, North Caloocan',
    address: 'Caloocan Sports Complex, Bagumbong Rd',
    city: 'Caloocan',
    latitude: 14.7432,
    longitude: 121.0378,
  },
  {
    id: 'd3800_caloocan_monumento',
    label: 'Caloocan Commercial Complex & Plaza, 8th Ave, Grace Park, South Caloocan',
    address: 'Caloocan Commercial Complex, 8th Ave',
    city: 'Caloocan',
    latitude: 14.6499,
    longitude: 120.9670,
  },

  // 📍 Mandaluyong
  {
    id: 'd3800_mandaluyong_maysilo',
    label: 'Mandaluyong City Executive Building, Maysilo Circle, Mandaluyong',
    address: 'Mandaluyong City Executive Building, Maysilo Circle',
    city: 'Mandaluyong',
    latitude: 14.5794,
    longitude: 121.0359,
  },
  {
    id: 'd3800_mandaluyong_convention',
    label: 'Mandaluyong City Convention Center, Maysilo, Mandaluyong',
    address: 'Mandaluyong City Convention Center',
    city: 'Mandaluyong',
    latitude: 14.5785,
    longitude: 121.0345,
  },

  // 📍 Malabon & Navotas
  {
    id: 'd3800_malabon_amphitheater',
    label: 'Malabon City Amphitheater Hall, Brgy. San Agustin, Malabon',
    address: 'Malabon Amphitheater Hall, Estrella St',
    city: 'Malabon',
    latitude: 14.6570,
    longitude: 120.9569,
  },
  {
    id: 'd3800_navotas_centennial_park',
    label: 'Navotas Centennial Park, C4 Road, Bagumbayan North, Navotas',
    address: 'Navotas Centennial Park, C4 Road',
    city: 'Navotas',
    latitude: 14.6542,
    longitude: 120.9416,
  },

  // 📍 Marikina
  {
    id: 'd3800_marikina_sports_center',
    label: 'Marikina Sports Center, Sumulong Hwy, Sto. Niño, Marikina',
    address: 'Marikina Sports Center, Sumulong Hwy',
    city: 'Marikina',
    latitude: 14.6366,
    longitude: 121.0975,
  },
  {
    id: 'd3800_marikina_nangka',
    label: 'Barangay Nangka Covered Court, JP Rizal St, Marikina',
    address: 'Barangay Nangka Covered Court, JP Rizal St',
    city: 'Marikina',
    latitude: 14.6738,
    longitude: 121.1172,
  },

  // 📍 Pasig
  {
    id: 'd3800_pasig_rainforest',
    label: 'Pasig City Rainforest Adventure Experience (RAVE Park), Maybunga, Pasig',
    address: 'Pasig City Rainforest Park, F. Legaspi St',
    city: 'Pasig',
    latitude: 14.5772,
    longitude: 121.0928,
  },
  {
    id: 'd3800_pasig_sports_center',
    label: 'Pasig City Hall Complex, Caruncho Ave, Pasig',
    address: 'Pasig City Hall Complex, Caruncho Ave',
    city: 'Pasig',
    latitude: 14.5583,
    longitude: 121.0805,
  },

  // 📍 San Juan
  {
    id: 'd3800_san_juan_pinaglabanan',
    label: 'Pinaglabanan Memorial Shrine & Plaza, Corazon de Jesus, San Juan',
    address: 'Pinaglabanan Memorial Shrine, Pinaglabanan St',
    city: 'San Juan',
    latitude: 14.6019,
    longitude: 121.0355,
  },

  // 📍 Province of Rizal
  {
    id: 'd3800_antipolo_ynares_center',
    label: 'Ynares Center Antipolo, P. Oliveros St, San Roque, Antipolo, Rizal',
    address: 'Ynares Center Antipolo, P. Oliveros St',
    city: 'Antipolo',
    latitude: 14.5869,
    longitude: 121.1764,
  },
  {
    id: 'd3800_san_mateo_plaza',
    label: 'San Mateo Municipal Plaza & Plaza Natividad, Gen. Luna Ave, San Mateo, Rizal',
    address: 'San Mateo Municipal Plaza, Gen. Luna Ave',
    city: 'San Mateo',
    latitude: 14.6961,
    longitude: 121.1219,
  },
  {
    id: 'd3800_cainta_one_arena',
    label: 'Cainta One Arena & Municipal Grounds, A. Bonifacio Ave, Cainta, Rizal',
    address: 'Cainta One Arena, A. Bonifacio Ave',
    city: 'Cainta',
    latitude: 14.5786,
    longitude: 121.1221,
  },
  {
    id: 'd3800_taytay_sports_complex',
    label: 'Taytay Sports Complex, Don Manalo St, Taytay, Rizal',
    address: 'Taytay Sports Complex, Don Manalo St',
    city: 'Taytay',
    latitude: 14.5683,
    longitude: 121.1322,
  },
  {
    id: 'd3800_angono_lakeside_park',
    label: 'Angono Lakeside Eco-Park, Brgy. San Vicente, Angono, Rizal',
    address: 'Angono Lakeside Eco-Park',
    city: 'Angono',
    latitude: 14.5204,
    longitude: 121.1444,
  },
  {
    id: 'd3800_binangonan_recreation_center',
    label: 'Binangonan Recreation Center & Plaza, Manila East Rd, Binangonan, Rizal',
    address: 'Binangonan Recreation Center, Manila East Rd',
    city: 'Binangonan',
    latitude: 14.4756,
    longitude: 121.1925,
  },
  {
    id: 'd3800_rodriguez_montalban_grounds',
    label: 'Montalban Municipal Grounds & Sports Complex, Rodriguez, Rizal',
    address: 'Rodriguez Municipal Plaza, J.P. Rizal St',
    city: 'Rodriguez',
    latitude: 14.7303,
    longitude: 121.1447,
  },
  {
    id: 'd3800_morong_municipal_park',
    label: 'Morong Municipal Park & Town Plaza, T. Claudio St, Morong, Rizal',
    address: 'Morong Town Plaza, T. Claudio St',
    city: 'Morong',
    latitude: 14.5122,
    longitude: 121.2386,
  },
  {
    id: 'd3800_tanay_park',
    label: 'Tanay Park & Municipal Grounds, M.H. Del Pilar St, Tanay, Rizal',
    address: 'Tanay Park, M.H. Del Pilar St',
    city: 'Tanay',
    latitude: 14.4981,
    longitude: 121.2842,
  },
];

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
  return result.display_name.split(',')[0]?.trim() ?? '';
}

/**
 * Search places biased strictly to Rotary District 3800 (Valenzuela, Caloocan,
 * Mandaluyong, Malabon, Navotas, Marikina, Pasig, San Juan, and Rizal Province).
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  // 1. Check local District 3800 presets first for instantaneous, exact matches
  const localMatches = DISTRICT_3800_PRESET_VENUES.filter(
    p =>
      p.label.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.city.toLowerCase().includes(q)
  );

  // 2. Query Nominatim with D3800 bounding box viewbox
  const url =
    `${ENDPOINT}?format=jsonv2&addressdetails=1&limit=8` +
    `&countrycodes=${COUNTRY_CODES}` +
    `&viewbox=${D3800_VIEWBOX}&bounded=0` +
    `&q=${encodeURIComponent(query.trim())}`;

  const headers: Record<string, string> =
    Platform.OS === 'web' ? {} : { 'User-Agent': 'RotaractConnect/1.0 (district 3800 events app)' };

  try {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) return localMatches;

    const results: NominatimResult[] = await response.json();
    const remoteSuggestions: PlaceSuggestion[] = results.map(result => ({
      id: String(result.place_id),
      label: result.display_name,
      address: addressOf(result),
      city: cityOf(result.address),
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
    }));

    // Merge without duplicate coordinates
    const combined = [...localMatches];
    for (const r of remoteSuggestions) {
      if (!combined.some(c => Math.abs(c.latitude - r.latitude) < 0.0005 && Math.abs(c.longitude - r.longitude) < 0.0005)) {
        combined.push(r);
      }
    }
    return combined.slice(0, 8);
  } catch (err) {
    if (signal?.aborted) throw err;
    return localMatches;
  }
}
