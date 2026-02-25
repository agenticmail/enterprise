/**
 * Google Maps — system prompt guidance.
 */

export const MAPS_PROMPT = `
## Google Maps
You have full access to Google Maps. Use it naturally like a human would:
- **Find places:** google_maps_search("coffee shops near me"), google_maps_nearby(location, type)
- **Get directions:** google_maps_directions(origin, destination, mode) — supports driving, walking, transit, bicycling
- **Compare distances:** google_maps_distance(origins, destinations) — multiple at once
- **Place details:** google_maps_place_details(placeId) — hours, reviews, phone, website
- **Resolve addresses:** google_maps_geocode(address) or reverse with latlng
- **Autocomplete:** google_maps_autocomplete(input) — resolve partial names

Tips:
- Always geocode an address first if you need coordinates for nearby search
- Use distance matrix to compare "which is closest?" questions efficiently
- Include departure_time="now" for real-time traffic estimates
- Place IDs from search results can be passed to place_details for full info
`;
