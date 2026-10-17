/** Local-storage stand-in for a future Supabase-backed db. Same getDb() -> { listStamps } shape so callers don't change when the real one lands. */
export async function getDb() {
  return {
    async listStamps(userId) {
      if (!userId) return []
      try { return JSON.parse(localStorage.getItem(`zoot.stamps.${userId}`)) ?? [] } catch { return [] }
    }
  }
}
