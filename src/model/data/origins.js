// placeholder origins
export const ORIGINS = [
  { id: 'changi-t3', label: 'Changi Airport T3', short: 'Changi T3', kind: 'airport', lat: 1.3563, lng: 103.9866 },
  { id: 'changi-t1', label: 'Changi Airport T1', short: 'Changi T1', kind: 'airport', lat: 1.3618, lng: 103.9899 },
  { id: 'changi-t2', label: 'Changi Airport T2', short: 'Changi T2', kind: 'airport', lat: 1.3553, lng: 103.9886 },
  { id: 'jewel', label: 'Jewel Changi (landside)', short: 'Jewel', kind: 'airport', lat: 1.3602, lng: 103.9894 },
  { id: 'hotel-city-hall', label: 'Downtown hotel (City Hall)', short: 'Hotel', kind: 'hotel', lat: 1.2935, lng: 103.8532 }
]

export const INTERESTS = [
  { id: 'hawker', label: 'Hawker', icon: 'bi-egg-fried' },
  { id: 'gardens', label: 'Gardens', icon: 'bi-flower1' },
  { id: 'photo', label: 'Photo', icon: 'bi-camera' },
  { id: 'views', label: 'Views', icon: 'bi-binoculars' },
  { id: 'culture', label: 'Culture', icon: 'bi-bank' },
  { id: 'museum', label: 'Museums', icon: 'bi-easel' },
  { id: 'heritage', label: 'Heritage', icon: 'bi-hourglass-split' },
  { id: 'food', label: 'Food', icon: 'bi-cup-hot' },
  { id: 'shopping', label: 'Shopping', icon: 'bi-bag' },
  { id: 'nightlife', label: 'Nightlife', icon: 'bi-moon-stars' },
  { id: 'nature', label: 'Nature', icon: 'bi-tree' },
  { id: 'beach', label: 'Beach', icon: 'bi-water' }
]

// Travel styles. `color` fills the badge, `on` is the icon colour that reads on top of it.
export const STYLES = {
  budget: { label: 'Budget', icon: 'bi-piggy-bank-fill', blurb: 'Hawkers, free sights, MRT everywhere.', color: '#ffcc00', on: '#111111' },
  adventurous: { label: 'Adventurous', icon: 'bi-compass-fill', blurb: 'More stops, more walking, big views.', color: '#f83878', on: '#111111' },
  party: { label: 'Party', icon: 'bi-stars', blurb: 'Buzzing streets, late food, rooftop energy.', color: '#111111', on: '#ffcc00' },
  conservative: { label: 'Conservative', icon: 'bi-shield-fill-check', blurb: 'Fewer stops, big buffers, indoor-friendly.', color: '#fff4c2', on: '#111111' }
}

/** Passport pages, in book order. Colours are the chop ink per area. */
export const AREAS = [
  { id: 'Changi', ink: '#111111', glyph: '✈' },
  { id: 'Marina Bay', ink: '#e0245e', glyph: '◈' },
  { id: 'Civic District', ink: '#d93a00', glyph: '⚖' },
  { id: 'Chinatown', ink: '#c1121f', glyph: '龍' },
  { id: 'Tiong Bahru', ink: '#111111', glyph: '◐' },
  { id: 'Kampong Glam', ink: '#b07d00', glyph: '☾' },
  { id: 'Little India', ink: '#e0245e', glyph: '✿' },
  { id: 'Orchard', ink: '#d93a00', glyph: '❦' },
  { id: 'Tanglin', ink: '#111111', glyph: '❀' },
  { id: 'East Coast', ink: '#b07d00', glyph: '≈' },
  { id: 'HarbourFront', ink: '#c1121f', glyph: '⚓' },
  { id: 'Sentosa', ink: '#e0245e', glyph: '☀' },
  { id: 'West', ink: '#d93a00', glyph: '⛩' },
  { id: 'North', ink: '#111111', glyph: '♣' }
]