import { computed } from 'vue'
import { useMissionStore } from '../../model/stores/mission.js'
import { usePartyStore } from '../../model/stores/party.js'
import { tick } from '../../model/services/clock.js'

/** Share my location (and see the others) from this long before the meet-up. */
export const LIVE_BEFORE_MIN = 30

/**
 * The social quest I'm in right now, as seen from the map: a guest with joined stops in their
 * plan, or a host whose open window has guests. Shared by the map chip (QuestCoopChip) and the
 * always-on map layer (QuestMapLive), so both agree on the same quest and times.
 *
 * Everything is derived from the mission and party stores plus the clock (`tick`).
 */
export function useActiveQuest() {
  const store = useMissionStore()
  const party = usePartyStore()

  /** Guest: { id, title, host_name, blocks, startMs, endMs } or null. */
  const joined = computed(() => store.joinedQuest)
  /** Host: my open window, if anyone has joined and it hasn't ended. */
  const hostedLive = computed(() => {
    const h = party.hosted
    return h && h.status !== 'closed' && h.roster?.length > 1 && Date.parse(h.ends_at) > tick.value ? h : null
  })
  /** { id, role: 'guest' | 'host', startMs, endMs } or null. */
  const active = computed(() => {
    if (joined.value) return { id: joined.value.id, role: 'guest', startMs: joined.value.startMs, endMs: joined.value.endMs }
    if (hostedLive.value) {
      return { id: hostedLive.value.id, role: 'host', startMs: Date.parse(hostedLive.value.starts_at), endMs: Date.parse(hostedLive.value.ends_at) }
    }
    return null
  })
  const started = computed(() => !!active.value && tick.value >= active.value.startMs)
  /** Locations are shared from LIVE_BEFORE_MIN before the start until the end. */
  const live = computed(() => !!active.value
    && tick.value >= active.value.startMs - LIVE_BEFORE_MIN * 60000
    && tick.value < active.value.endMs)
  const guestNames = computed(() => (hostedLive.value?.roster || []).filter((m) => m.role !== 'host').map((m) => m.display_name))
  /** Where my own plan picks up after the joined stops (a visit, or the return leg). */
  const resume = computed(() => store.resumeLeg)

  return { joined, hostedLive, active, started, live, guestNames, resume }
}
