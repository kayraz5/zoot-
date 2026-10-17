import { defineStore } from 'pinia'

/**
 * P1 — public quest parties (approve-to-join + realtime chat).
 * Tables `parties`, `party_members`, `messages` and their RLS already exist in
 * supabase/schema.sql. Wire Supabase Realtime here in Phase 8.
 */
export const usePartyStore = defineStore('party', {
  state: () => ({ parties: [], active: null, messages: [] })
})
