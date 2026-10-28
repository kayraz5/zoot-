/**
 * Interest groups, each covering one or more catalog tags the planner scores on.
 * Shared by the plan page (interest tiles) and Explore (filter chips).
 */
export const TILES = [
	{ id: 'food', label: 'Food & hawker', icon: 'bi-egg-fried', tags: ['hawker', 'food'] },
	{ id: 'nature', label: 'Nature & gardens', icon: 'bi-flower1', tags: ['gardens', 'nature', 'beach'] },
	{ id: 'culture', label: 'Culture & heritage', icon: 'bi-bank', tags: ['culture', 'heritage', 'museum'] },
	{ id: 'views', label: 'Views & photos', icon: 'bi-camera', tags: ['views', 'photo'] },
	{ id: 'shopping', label: 'Shopping', icon: 'bi-bag', tags: ['shopping'] },
	{ id: 'nightlife', label: 'Nightlife', icon: 'bi-moon-stars', tags: ['nightlife'] }
]
