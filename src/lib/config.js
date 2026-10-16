/** Runtime flags derived from env. Import these instead of reading import.meta.env everywhere. */
const env = import.meta.env || {}

export const SUPABASE_URL = env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || ''
export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** /dev panel: always in `vite dev`; in production only when VITE_DEV_PANEL=1. */
export const DEV_PANEL = Boolean(env.DEV) || env.VITE_DEV_PANEL === '1'

export const CITY = { name: 'Singapore', lat: 1.2903, lng: 103.8519, tz: 'Asia/Singapore', utcOffsetMin: 480 }

/** Check-in geofence rules (mirrored in supabase/schema.sql → stamp_place). */
export const CHECKIN = { radiusM: 80, poorAccuracyRadiusM: 120, poorAccuracyM: 50, rejectAccuracyM: 150 }
