import { Ionicons } from '@expo/vector-icons';
import { AreaOfFocus } from '../types';

export const AREAS_OF_FOCUS: {
  key: AreaOfFocus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'PEACEBUILDING', label: 'Peacebuilding and Conflict Prevention', icon: 'ribbon-outline' },
  { key: 'DISEASE_PREVENTION', label: 'Disease Prevention and Treatment', icon: 'medkit-outline' },
  { key: 'WATER_SANITATION', label: 'Water, Sanitation, and Hygiene', icon: 'water-outline' },
  { key: 'MATERNAL_CHILD_HEALTH', label: 'Maternal and Child Health', icon: 'heart-outline' },
  { key: 'EDUCATION_LITERACY', label: 'Basic Education and Literacy', icon: 'book-outline' },
  { key: 'COMMUNITY_DEVELOPMENT', label: 'Community Economic and Community Development', icon: 'business-outline' },
  { key: 'ENVIRONMENT', label: 'Protecting the Environment', icon: 'leaf-outline' },
];

const BY_KEY = new Map(AREAS_OF_FOCUS.map(a => [a.key, a]));

export function areaOfFocusLabel(key: AreaOfFocus): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function areaOfFocusIcon(key: AreaOfFocus): keyof typeof Ionicons.glyphMap {
  return BY_KEY.get(key)?.icon ?? 'ellipse-outline';
}
