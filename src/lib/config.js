/* Runtime flags parser from .env */
const env = import.meta.env || {};

// Supabase API Key parser and detector
export const SUPABASE_URL = env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || "";
export const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);