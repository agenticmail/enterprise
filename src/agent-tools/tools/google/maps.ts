/**
 * Google Maps Platform Tools
 *
 * Gives agents access to Google Maps APIs:
 * - Places (search, details, nearby, autocomplete, photos)
 * - Directions (routes, distance, duration, steps)
 * - Geocoding (address → coordinates, coordinates → address)
 * - Distance Matrix (multiple origins × destinations)
 *
 * Requires GOOGLE_MAPS_API_KEY env var with Places, Directions, Geocoding,
 * and Distance Matrix APIs enabled in Google Cloud Console.
 */

import type { AnyAgentTool } from '../../types.js';
import { jsonResult, errorResult, textResult } from '../../common.js';

export interface GoogleMapsConfig {
  /** Resolve the Google Maps API key. Called on each request (supports vault decryption). */
  getApiKey: () => Promise<string> | string;
}

// ─── Helpers ────────────────────────────────────────────

let _config: GoogleMapsConfig | null = null;

async function getApiKey(): Promise<string> {
  if (!_config) throw new Error('Google Maps not configured. Add your Maps API Key in Dashboard → Settings → Integrations → Google Maps.');
  const key = await _config.getApiKey();
  if (!key) throw new Error('Google Maps API key is empty. Update it in Dashboard → Settings → Integrations → Google Maps.');
  return key;
}

async function mapsApi(endpoint: string, params: Record<string, string>): Promise<any> {
  const key = await getApiKey();
  const url = new URL(`https://maps.googleapis.com/maps/api${endpoint}`);
  url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Maps API ${res.status}: ${errText}`);
  }
  return res.json();
}

// Places API (New) uses different base URL
async function placesApiNew(path: string, body: any): Promise<any> {
  const key = await getApiKey();
  const res = await fetch(`https://places.googleapis.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': body._fieldMask || '*',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Places API (New) ${res.status}: ${errText}`);
  }
  return res.json();
}

// Format a place result into a clean summary
function formatPlace(p: any): any {
  return {
    name: p.name || p.displayName?.text,
    address: p.formatted_address || p.formattedAddress || p.vicinity,
    placeId: p.place_id || p.id,
    rating: p.rating,
    totalRatings: p.user_ratings_total || p.userRatingCount,
    priceLevel: p.price_level ?? p.priceLevel,
    types: p.types,
    location: p.geometry?.location || p.location,
    openNow: p.opening_hours?.open_now ?? p.currentOpeningHours?.openNow,
    businessStatus: p.business_status || p.businessStatus,
    phone: p.formatted_phone_number || p.nationalPhoneNumber,
    website: p.website || p.websiteUri,
  };
}

// Format distance/duration into human-friendly text
function formatRoute(route: any): any {
  const leg = route.legs?.[0];
  if (!leg) return route;
  return {
    distance: leg.distance?.text,
    distanceMeters: leg.distance?.value,
    duration: leg.duration?.text,
    durationSeconds: leg.duration?.value,
    durationInTraffic: leg.duration_in_traffic?.text,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
    steps: leg.steps?.map((s: any) => ({
      instruction: s.html_instructions?.replace(/<[^>]*>/g, ''),
      distance: s.distance?.text,
      duration: s.duration?.text,
      travelMode: s.travel_mode,
    })),
    summary: route.summary,
    warnings: route.warnings,
  };
}

// ─── Tool Definitions ───────────────────────────────────

export function createGoogleMapsTools(config: GoogleMapsConfig): AnyAgentTool[] {
  _config = config;
  return [

    // ─── Places: Text Search ──────────────────────────
    {
      name: 'google_maps_search',
      description: 'Search for places by text query. Returns name, address, rating, location.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'e.g. "pizza near me"' },
          location: { type: 'string', description: 'lat,lng to bias results' },
          radius: { type: 'number', description: 'Radius in meters' },
          type: { type: 'string', description: 'e.g. restaurant, gas_station' },
          openNow: { type: 'boolean', description: 'Only show places that are currently open' },
          maxResults: { type: 'number', description: 'Max results to return (default 10, max 20)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const p: Record<string, string> = { query: params.query };
          if (params.location) p.location = params.location;
          if (params.radius) p.radius = String(params.radius);
          if (params.type) p.type = params.type;
          if (params.openNow) p.opennow = 'true';
          const data = await mapsApi('/place/textsearch/json', p);
          if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            return errorResult(`Places API error: ${data.status} — ${data.error_message || ''}`);
          }
          const max = Math.min(params.maxResults || 10, 20);
          const places = (data.results || []).slice(0, max).map(formatPlace);
          return jsonResult({ query: params.query, results: places, count: places.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Places: Nearby Search ────────────────────────
    {
      name: 'google_maps_nearby',
      description: 'Find nearby places by type and location.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          location: { type: 'string', description: 'lat,lng center point' },
          radius: { type: 'number', description: 'Radius in meters (max 50000, default 1500)' },
          type: { type: 'string', description: 'e.g. restaurant, atm, pharmacy' },
          keyword: { type: 'string' },
          openNow: { type: 'boolean', description: 'Only currently open places' },
          maxResults: { type: 'number', description: 'Max results (default 10, max 20)' },
        },
        required: ['location'],
      },
      async execute(_id: string, params: any) {
        try {
          const p: Record<string, string> = {
            location: params.location,
            radius: String(params.radius || 1500),
          };
          if (params.type) p.type = params.type;
          if (params.keyword) p.keyword = params.keyword;
          if (params.openNow) p.opennow = 'true';
          const data = await mapsApi('/place/nearbysearch/json', p);
          if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            return errorResult(`Nearby search error: ${data.status} — ${data.error_message || ''}`);
          }
          const max = Math.min(params.maxResults || 10, 20);
          const places = (data.results || []).slice(0, max).map(formatPlace);
          return jsonResult({ location: params.location, radius: params.radius || 1500, results: places, count: places.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Places: Details ──────────────────────────────
    {
      name: 'google_maps_place_details',
      description: 'Get place details (hours, phone, website, reviews, photos).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          placeId: { type: 'string', description: 'Google Place ID (from search results)' },
        },
        required: ['placeId'],
      },
      async execute(_id: string, params: any) {
        try {
          const data = await mapsApi('/place/details/json', {
            place_id: params.placeId,
            fields: 'name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,price_level,opening_hours,reviews,geometry,business_status,types,url',
          });
          if (data.status !== 'OK') {
            return errorResult(`Place details error: ${data.status} — ${data.error_message || ''}`);
          }
          const p = data.result;
          const details = {
            ...formatPlace(p),
            hours: p.opening_hours?.weekday_text,
            reviews: p.reviews?.slice(0, 5).map((r: any) => ({
              author: r.author_name,
              rating: r.rating,
              text: r.text?.slice(0, 300),
              time: r.relative_time_description,
            })),
            googleMapsUrl: p.url,
          };
          return jsonResult(details);
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Directions ───────────────────────────────────
    {
      name: 'google_maps_directions',
      description: 'Get directions between two locations. Returns route, distance, duration, and turn-by-turn steps. Supports driving, walking, bicycling, and transit.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          origin: { type: 'string', description: 'Address or lat,lng' },
          destination: { type: 'string', description: 'End point — address, place name, or "lat,lng"' },
          mode: { type: 'string', description: 'Travel mode: driving (default), walking, bicycling, transit' },
          avoidTolls: { type: 'boolean', description: 'Avoid toll roads' },
          avoidHighways: { type: 'boolean', description: 'Avoid highways' },
          departureTime: { type: 'string', description: 'Departure time as ISO string or "now" (for traffic estimates, driving only)' },
          alternatives: { type: 'boolean', description: 'Return alternative routes (default false)' },
          waypoints: { type: 'string', description: 'Intermediate stops, pipe-separated (e.g. "Durham, NC|Raleigh, NC")' },
        },
        required: ['origin', 'destination'],
      },
      async execute(_id: string, params: any) {
        try {
          const p: Record<string, string> = {
            origin: params.origin,
            destination: params.destination,
            mode: params.mode || 'driving',
          };
          const avoid: string[] = [];
          if (params.avoidTolls) avoid.push('tolls');
          if (params.avoidHighways) avoid.push('highways');
          if (avoid.length) p.avoid = avoid.join('|');
          if (params.departureTime === 'now') p.departure_time = 'now';
          else if (params.departureTime) p.departure_time = String(Math.floor(new Date(params.departureTime).getTime() / 1000));
          if (params.alternatives) p.alternatives = 'true';
          if (params.waypoints) p.waypoints = params.waypoints;

          const data = await mapsApi('/directions/json', p);
          if (data.status !== 'OK') {
            return errorResult(`Directions error: ${data.status} — ${data.error_message || ''}`);
          }
          const routes = data.routes.map(formatRoute);
          return jsonResult({
            origin: params.origin,
            destination: params.destination,
            mode: params.mode || 'driving',
            routes,
            routeCount: routes.length,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Distance Matrix ──────────────────────────────
    {
      name: 'google_maps_distance',
      description: 'Calculate distances and travel times between multiple origins and destinations. Great for comparing options (e.g. "which of these 3 restaurants is closest to my office?").',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          origins: { type: 'string', description: 'One or more origins, pipe-separated (e.g. "New York, NY|Boston, MA")' },
          destinations: { type: 'string', description: 'One or more destinations, pipe-separated' },
          mode: { type: 'string', description: 'Travel mode: driving (default), walking, bicycling, transit' },
          departureTime: { type: 'string', description: '"now" or ISO string for traffic-based estimates' },
        },
        required: ['origins', 'destinations'],
      },
      async execute(_id: string, params: any) {
        try {
          const p: Record<string, string> = {
            origins: params.origins,
            destinations: params.destinations,
            mode: params.mode || 'driving',
          };
          if (params.departureTime === 'now') p.departure_time = 'now';
          else if (params.departureTime) p.departure_time = String(Math.floor(new Date(params.departureTime).getTime() / 1000));

          const data = await mapsApi('/distancematrix/json', p);
          if (data.status !== 'OK') {
            return errorResult(`Distance Matrix error: ${data.status} — ${data.error_message || ''}`);
          }

          const results: any[] = [];
          const origins = data.origin_addresses || [];
          const destinations = data.destination_addresses || [];
          for (let i = 0; i < origins.length; i++) {
            for (let j = 0; j < destinations.length; j++) {
              const el = data.rows[i]?.elements[j];
              if (el?.status === 'OK') {
                results.push({
                  origin: origins[i],
                  destination: destinations[j],
                  distance: el.distance?.text,
                  distanceMeters: el.distance?.value,
                  duration: el.duration?.text,
                  durationSeconds: el.duration?.value,
                  durationInTraffic: el.duration_in_traffic?.text,
                });
              } else {
                const elStatus = el?.status || 'UNKNOWN';
                const entry: any = { origin: origins[i], destination: destinations[j], status: elStatus };
                if (elStatus === 'ZERO_RESULTS') {
                  entry.reason = 'No driving/transit route exists (likely separated by ocean). Straight-line distance provided below.';
                } else if (elStatus === 'NOT_FOUND') {
                  entry.reason = 'Origin or destination not recognized.';
                } else if (elStatus === 'MAX_ROUTE_LENGTH_EXCEEDED') {
                  entry.reason = 'Route too long for this travel mode.';
                }
                results.push(entry);
              }
            }
          }
          // If all results are ZERO_RESULTS, auto-calculate straight-line distance via geocoding
          const allZero = results.length > 0 && results.every((r: any) => r.status === 'ZERO_RESULTS');
          if (allZero) {
            try {
              const origGeo = await mapsApi('/geocode/json', { address: params.origins.split('|')[0] });
              const destGeo = await mapsApi('/geocode/json', { address: params.destinations.split('|')[0] });
              const oLoc = origGeo.results?.[0]?.geometry?.location;
              const dLoc = destGeo.results?.[0]?.geometry?.location;
              if (oLoc && dLoc) {
                const R = 3958.8; // Earth radius in miles
                const dLat = (dLoc.lat - oLoc.lat) * Math.PI / 180;
                const dLon = (dLoc.lng - oLoc.lng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(oLoc.lat * Math.PI / 180) * Math.cos(dLoc.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) ** 2;
                const miles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const km = miles * 1.60934;
                return jsonResult({
                  mode: 'straight-line',
                  note: 'No driving route exists. Calculated straight-line (great-circle) distance instead.',
                  results: [{
                    origin: results[0].origin,
                    destination: results[0].destination,
                    distance: `${Math.round(miles).toLocaleString()} miles (${Math.round(km).toLocaleString()} km)`,
                    distanceMiles: Math.round(miles),
                    distanceKm: Math.round(km),
                    type: 'straight-line / flight distance',
                  }],
                });
              }
            } catch { /* fall through to original ZERO_RESULTS response */ }
          }

          return jsonResult({ mode: params.mode || 'driving', results });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Geocode ──────────────────────────────────────
    {
      name: 'google_maps_geocode',
      description: 'Convert an address to coordinates (geocoding) or coordinates to an address (reverse geocoding).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          address: { type: 'string', description: 'Address to geocode (e.g. "1600 Amphitheatre Parkway, Mountain View, CA")' },
          latlng: { type: 'string', description: 'Coordinates for reverse geocoding: "lat,lng" (e.g. "37.4224,-122.0842")' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          if (!params.address && !params.latlng) return errorResult('Provide either "address" or "latlng".');
          const p: Record<string, string> = {};
          if (params.address) p.address = params.address;
          if (params.latlng) p.latlng = params.latlng;

          const data = await mapsApi('/geocode/json', p);
          if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            return errorResult(`Geocoding error: ${data.status} — ${data.error_message || ''}`);
          }
          const results = (data.results || []).slice(0, 5).map((r: any) => ({
            formattedAddress: r.formatted_address,
            location: r.geometry?.location,
            placeId: r.place_id,
            types: r.types,
            addressComponents: r.address_components?.map((c: any) => ({ long: c.long_name, short: c.short_name, types: c.types })),
          }));
          return jsonResult({ query: params.address || params.latlng, results, count: results.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Place Autocomplete ───────────────────────────
    {
      name: 'google_maps_autocomplete',
      description: 'Get place name suggestions as you type. Useful for resolving partial/ambiguous place names before searching or getting directions.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          input: { type: 'string', description: 'Partial place name or address (e.g. "star" → "Starbucks", "JFK" → "John F. Kennedy International Airport")' },
          location: { type: 'string', description: 'Bias near: "lat,lng"' },
          radius: { type: 'number', description: 'Bias radius in meters' },
          types: { type: 'string', description: 'Restrict type: geocode, address, establishment, (regions), (cities)' },
        },
        required: ['input'],
      },
      async execute(_id: string, params: any) {
        try {
          const p: Record<string, string> = { input: params.input };
          if (params.location) p.location = params.location;
          if (params.radius) p.radius = String(params.radius);
          if (params.types) p.types = params.types;
          const data = await mapsApi('/place/autocomplete/json', p);
          if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
            return errorResult(`Autocomplete error: ${data.status} — ${data.error_message || ''}`);
          }
          const predictions = (data.predictions || []).map((p: any) => ({
            description: p.description,
            placeId: p.place_id,
            types: p.types,
            mainText: p.structured_formatting?.main_text,
            secondaryText: p.structured_formatting?.secondary_text,
          }));
          return jsonResult({ input: params.input, predictions, count: predictions.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Static Map URL ───────────────────────────────
    {
      name: 'google_maps_static',
      description: 'Generate a static map image URL showing a location, markers, or a route path. The URL can be shared or embedded.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          center: { type: 'string', description: 'Center of the map: address or "lat,lng"' },
          zoom: { type: 'number', description: 'Zoom level: 0 (world) to 21 (building). Default 14.' },
          size: { type: 'string', description: 'Image size: "WIDTHxHEIGHT" (default "600x400", max 640x640)' },
          markers: { type: 'string', description: 'Marker positions, pipe-separated (e.g. "color:red|35.99,-78.89|36.00,-78.90")' },
          path: { type: 'string', description: 'Draw a path/route: "color:0x0000ff|weight:5|enc:ENCODED_POLYLINE"' },
          maptype: { type: 'string', description: 'Map type: roadmap (default), satellite, terrain, hybrid' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const key = await getApiKey();
          const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
          url.searchParams.set('key', key);
          url.searchParams.set('size', params.size || '600x400');
          url.searchParams.set('maptype', params.maptype || 'roadmap');
          if (params.center) url.searchParams.set('center', params.center);
          if (params.zoom !== undefined) url.searchParams.set('zoom', String(params.zoom));
          if (params.markers) url.searchParams.set('markers', params.markers);
          if (params.path) url.searchParams.set('path', params.path);
          // If no center and no markers, this will error
          if (!params.center && !params.markers) return errorResult('Provide "center" or "markers".');
          return jsonResult({ mapUrl: url.toString(), note: 'This URL renders a static map image. Share it directly or open in a browser.' });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Timezone ─────────────────────────────────────
    {
      name: 'google_maps_timezone',
      description: 'Get the timezone for a specific location (coordinates). Returns timezone ID, name, and UTC offsets.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          location: { type: 'string', description: 'Coordinates: "lat,lng"' },
          timestamp: { type: 'number', description: 'Unix timestamp (default: now). Affects DST offset.' },
        },
        required: ['location'],
      },
      async execute(_id: string, params: any) {
        try {
          const data = await mapsApi('/timezone/json', {
            location: params.location,
            timestamp: String(params.timestamp || Math.floor(Date.now() / 1000)),
          });
          if (data.status !== 'OK') {
            return errorResult(`Timezone error: ${data.status} — ${data.error_message || ''}`);
          }
          return jsonResult({
            timeZoneId: data.timeZoneId,
            timeZoneName: data.timeZoneName,
            rawOffset: data.rawOffset,
            dstOffset: data.dstOffset,
            totalOffsetHours: (data.rawOffset + data.dstOffset) / 3600,
          });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    // ─── Elevation ────────────────────────────────────
    {
      name: 'google_maps_elevation',
      description: 'Get the elevation (altitude) for one or more locations.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          locations: { type: 'string', description: 'One or more "lat,lng" pairs, pipe-separated (e.g. "35.99,-78.89|36.00,-78.90")' },
        },
        required: ['locations'],
      },
      async execute(_id: string, params: any) {
        try {
          const data = await mapsApi('/elevation/json', { locations: params.locations });
          if (data.status !== 'OK') {
            return errorResult(`Elevation error: ${data.status} — ${data.error_message || ''}`);
          }
          const results = (data.results || []).map((r: any) => ({
            location: r.location,
            elevationMeters: Math.round(r.elevation * 10) / 10,
            elevationFeet: Math.round(r.elevation * 3.28084 * 10) / 10,
            resolution: r.resolution,
          }));
          return jsonResult({ results });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
