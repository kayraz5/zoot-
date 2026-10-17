/**
 * Sidequests: short optional detours that spawn as floating tokens when the
 * traveller walks within 400 m and the clock has slack (Hulbert's lane).
 * `place_id` must exist in places.sg.json. extra time = detour walk + stay_min.
 */
export const SIDEQUESTS = [
  { id: 'sq-rainbow-windows', place_id: 'old-hill-street-police', title: 'Rainbow window hunt', stay_min: 10, xp: 40, prompt: 'Count the colours on the shutters and grab a symmetrical shot.' },
  { id: 'sq-helix-night', place_id: 'helix-bridge', title: 'Walk the DNA bridge', stay_min: 12, xp: 40, prompt: 'Find the letters C, G, A and T lit into the bridge.' },
  { id: 'sq-merlion', place_id: 'merlion-park', title: 'Merlion selfie', stay_min: 15, xp: 50, prompt: 'Line up the fountain so it looks like you are drinking it.' },
  { id: 'sq-cattle-sign', place_id: 'cavenagh-bridge', title: 'No cattle allowed', stay_min: 8, xp: 35, prompt: 'Find the 1901 police sign banning horses and cattle.' },
  { id: 'sq-kaya-toast', place_id: 'ya-kun-far-east', title: 'Kaya toast pit stop', stay_min: 20, xp: 45, prompt: 'Order Set A and crack the eggs like a local (soy + pepper).' },
  { id: 'sq-nail-free', place_id: 'thian-hock-keng', title: 'The temple without nails', stay_min: 15, xp: 40, prompt: 'Look up: every beam is slotted, not nailed.' },
  { id: 'sq-colour-block', place_id: 'peoples-park-complex', title: 'Colour-block facade', stay_min: 10, xp: 35, prompt: 'Frame all four colour bands in one shot from Chinatown Point.' },
  { id: 'sq-satay-street', place_id: 'lau-pa-sat', title: 'Satay smoke signal', stay_min: 25, xp: 50, prompt: 'Grab ten sticks and find the Glasgow iron in the roof.' },
  { id: 'sq-tan-teng-niah', place_id: 'tan-teng-niah', title: 'Rainbow villa', stay_min: 8, xp: 35, prompt: 'Count the colours on the timber shutters.' },
  { id: 'sq-haji-mural', place_id: 'haji-lane', title: 'Mural crawl', stay_min: 15, xp: 45, prompt: 'Photograph three murals that face each other.' },
  { id: 'sq-fortune-sticks', place_id: 'kwan-im-temple', title: 'Fortune sticks', stay_min: 12, xp: 35, prompt: 'Watch someone shake the kau cim cylinder.' },
  { id: 'sq-koon-seng', place_id: 'koon-seng-shophouses', title: 'Peranakan doorways', stay_min: 15, xp: 45, prompt: 'Find a doorway with tiles in three colours.' },
  { id: 'sq-emerald-hill', place_id: 'emerald-hill', title: 'Escape Orchard Road', stay_min: 12, xp: 40, prompt: 'Walk up the hill until you cannot hear traffic.' },
  { id: 'sq-forest-valley', place_id: 'jewel-forest-valley', title: 'Canopy loop', stay_min: 20, xp: 40, prompt: 'Walk one full spiral of the Forest Valley.' },
  { id: 'sq-esplanade-roof', place_id: 'esplanade', title: 'Durian rooftop', stay_min: 15, xp: 40, prompt: 'Find the free rooftop terrace on level 4.' },
  { id: 'sq-armenian', place_id: 'armenian-church', title: 'Oldest church', stay_min: 12, xp: 35, prompt: 'Find the Vanda Miss Joaquim orchid grave in the garden.' },
  { id: 'sq-art-deco', place_id: 'tiong-bahru-estate', title: 'Spiral staircase spotter', stay_min: 20, xp: 45, prompt: 'Find three of the spiral back staircases.' },
  { id: 'sq-rain-oculus', place_id: 'shoppes-mbs', title: 'Rain Oculus', stay_min: 10, xp: 35, prompt: 'Watch the whirlpool drain through the acrylic bowl.' }
]
