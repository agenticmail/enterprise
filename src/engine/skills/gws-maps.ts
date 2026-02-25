import { Emoji } from '../emoji.js';
import type { SkillDefinition, ToolDefinition } from '../skills.js';

export const SKILL_DEF: Omit<SkillDefinition, 'tools'> = {
  id: 'gws-maps',
  name: 'Google Maps',
  description: 'Places search, directions, distances, geocoding, timezone, elevation, and static maps.',
  category: 'utility',
  risk: 'low',
  icon: Emoji.map,
  source: 'builtin',
};

export const TOOLS: ToolDefinition[] = [
  { id: 'google_maps_search', name: 'Search Places', description: 'Search for places by text query', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_nearby', name: 'Nearby Places', description: 'Find places near a location', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_place_details', name: 'Place Details', description: 'Get detailed info about a place', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_directions', name: 'Directions', description: 'Get driving/walking/transit directions', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_distance', name: 'Distance Matrix', description: 'Calculate distances and travel times', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_geocode', name: 'Geocode', description: 'Convert address to coordinates or vice versa', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_autocomplete', name: 'Autocomplete', description: 'Place name autocomplete suggestions', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_static', name: 'Static Map', description: 'Generate a static map image URL', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_timezone', name: 'Timezone', description: 'Get timezone for a location', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
  { id: 'google_maps_elevation', name: 'Elevation', description: 'Get elevation for coordinates', category: 'read', risk: 'low', skillId: 'gws-maps', sideEffects: [] },
];
