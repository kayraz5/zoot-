import { defineStore } from 'pinia'
import { getDb } from '../services/db/index.js'
import { buildMission } from '../services/groq.js'
import { catalog, placeById, loadCatalog } from '../services/catalog.js'
import { keptVisits, slackMinutes, leaveByMs, retimeMission, stayMinutes, xpFor } from '../services/planner.js'
import { travel, distanceM } from '../services/travel.js'
import { rainLookup } from '../services/weather.js'
import { now } from '../services/clock.js'
import { geo, hasFix } from '../services/geo.js'
import { SIDEQUESTS } from '../data/sidequests.js'
import { useUiStore } from './ui.js'
import { useUserStore } from './user.js'
import { usePassportStore } from './passport.js'
import { usePartyStore } from './party.js'

const ACTIVE_KEY = 'zoot.activeMission'
const SIDEQUEST_RADIUS_M = 400
const SIDEQUEST_BUFFER_MIN = 10

/** The active mission and everything that mutates it (plan, replan, stamp, sidequest). */
export const useMissionStore = defineStore('mission', {
  state: () => ({
    mission: null,
    status: 'idle', // idle | planning | ready | error
    statusText: '',
    refusal: null,
    lastSource: null
  }),
  getters: {
    legs: (s) => s.mission?.legs || [],
    visitLegs() { return this.legs.filter((l) => l.kind === 'visit') },
    returnLeg() { return this.legs.find((l) => l.kind === 'return') || null },
    nextLeg() {
      return this.visitLegs.find((l) => l.status === 'pending') || (this.returnLeg?.status === 'pending' ? this.returnLeg : null)
    },
    stampedCount() { return this.visitLegs.filter((l) => l.status === 'stamped').length },
    arriveByMs() { return this.returnLeg ? Date.parse(this.returnLeg.arrive_by) : null },
    mustReturnMs: (s) => (s.mission ? Date.parse(s.mission.must_return_iso) : null),
    missionPlaceIds() { return new Set(this.visitLegs.map((l) => l.place_id)) }
  },
  actions: {
    baseCtx(overrides = {}) {
      const ui = useUiStore()
      return {
        catalog: catalog.value,
        rainAt: rainLookup(ui.weather, false),
        forceRain: ui.forceRain,
        ...overrides
      }
    },

    /** New mission from a saved trip. */
    async planFromTrip(trip) {
      await loadCatalog()
      const ui = useUiStore()
      if (!ui.weather) await ui.loadWeather()
      this.status = 'planning'
      this.refusal = null
      const ctx = this.baseCtx({
        tripId: trip.id,
        origin: trip.origin,
        startMs: Date.parse(trip.start_at),
        mustReturnMs: Date.parse(trip.must_return_at),
        cleared: trip.cleared,
        style: trip.style,
        interests: trip.interests,
        energy: trip.energy,
        indoorPref: trip.indoorPref,
        maxWalk: trip.maxWalk,
        partySize: trip.partySize
      })
      const r = await buildMission(ctx, { onStatus: (t) => (this.statusText = t) })
      if (!r.ok) {
        this.status = 'error'
        this.refusal = r.reason
        return null
      }
      this.lastSource = r.source
      await this.persist(r.mission)
      this.status = 'ready'
      return r.mission
    },

    async persist(mission) {
      const db = await getDb()
      await db.saveMission(mission)
      this.mission = mission
      try { localStorage.setItem(ACTIVE_KEY, mission.id) } catch {}
      usePassportStore().markSeen(mission.legs.filter((l) => l.kind === 'visit').map((l) => l.place_id))
      // If I've opened part of this mission to company, keep what guests see in step (no-op otherwise).
      usePartyStore().syncHostedWindow(mission)
    },

    async load(id) {
      if (this.mission?.id === id) return this.mission
      const db = await getDb()
      const m = await db.getMission(id)
      if (m) {
        this.mission = m
        this.status = 'ready'
        try { localStorage.setItem(ACTIVE_KEY, id) } catch {}
      }
      return m
    },

    async loadActive() {
      if (this.mission) return this.mission
      let id = null
      try { id = localStorage.getItem(ACTIVE_KEY) } catch {}
      if (id) return this.load(id)
      const db = await getDb()
      const [latest] = await db.listMissions()
      if (latest) return this.load(latest.id)
      return null
    },

    here() {
      if (hasFix()) return { lat: geo.lat, lng: geo.lng }
      const lastStamped = [...this.visitLegs].reverse().find((l) => l.status === 'stamped')
      return lastStamped ? { lat: lastStamped.lat, lng: lastStamped.lng } : this.mission.origin
    },

    /**
     * Mid-walk replan: keeps stamped legs, replaces only future legs.
     * mode: 'behind' | 'less-walking' | 'swap' | 'rain'
     */
    async replan(mode) {
      const m = this.mission
      if (!m) return
      await loadCatalog()
      const exclude = new Set(m.legs.filter((l) => l.kind === 'visit' && l.status !== 'pending').map((l) => l.place_id))
      const prefs = { ...m.prefs }
      let forceIndoor = false
      if (mode === 'swap' && this.nextLeg?.kind === 'visit') exclude.add(this.nextLeg.place_id)
      if (mode === 'less-walking') { prefs.maxWalk = 8; prefs.energy = 'low' }
      if (mode === 'rain') forceIndoor = true
      if (mode === 'behind') prefs.energy = prefs.energy === 'high' ? 'med' : 'low'

      this.status = 'planning'
      const ctx = this.baseCtx({
        tripId: m.trip_id,
        origin: m.origin,
        startMs: Date.parse(m.start_iso),
        mustReturnMs: Date.parse(m.must_return_iso),
        ...prefs,
        style: m.style,
        forceIndoor,
        excludeIds: exclude,
        start: { point: this.here(), ms: now() },
        keepVisits: keptVisits(m, placeById.value),
        meta: { id: m.id }
      })
      const r = await buildMission(ctx, { onStatus: (t) => (this.statusText = t) })
      this.status = 'ready'
      if (!r.ok) {
        useUiStore().toast(r.reason, 'warning', 5000)
        return false
      }
      r.mission.prefs = { ...r.mission.prefs, ...prefs }
      r.mission.replans = (m.replans || 0) + 1
      await this.persist(r.mission)
      useUiStore().toast(labelFor(mode) + ': future stops rewritten.', 'success')
      return true
    },

    /**
     * Hand edits to the itinerary. `mutate(legs, mission)` changes a copy of the legs; the copy is
     * then re-timed from where the traveller is (or from the start, if they have not left yet).
     * Edits that would land at a closed place or miss arrive_by are refused, never saved.
     */
    async editLegs(mutate, message) {
      const m = this.mission
      if (!m) return false
      await loadCatalog()
      const draft = JSON.parse(JSON.stringify(m))
      const error = mutate(draft.legs, draft)
      if (error) {
        useUiStore().toast(error, 'warning', 4000)
        return false
      }
      const departMs = Date.parse(m.start_iso) + m.buffers.exit_min * 60000
      const start = now() >= departMs ? { point: this.here(), ms: now() } : { point: m.origin, ms: departMs }
      const { mission, problems } = retimeMission(draft, { start, catalogById: placeById.value })
      if (problems.length) {
        useUiStore().toast(`That doesn't fit: ${problems[0]}.`, 'warning', 5000)
        return false
      }
      mission.edits = (m.edits || 0) + 1
      await this.persist(mission)
      if (message) useUiStore().toast(message, 'success')
      return true
    },

    // Stops are found by place_id: it is unique in a mission, while seq is renumbered on every edit.

    /** Insert a catalog place after the stop at `afterPlaceId`, or just before the return leg. */
    addStop(place, afterPlaceId = null) {
      return this.editLegs((legs, m) => {
        if (legs.some((l) => l.place_id === place.id)) return `${place.name} is already in this mission.`
        const at = afterPlaceId == null ? legs.findIndex((l) => l.kind === 'return') : indexOfStop(legs, afterPlaceId) + 1
        if (at < 1 && afterPlaceId != null) return STALE
        legs.splice(at, 0, userLeg(place, m, 'You added this stop.'))
      }, `${place.name} added.`)
    },

    swapStop(leg, place) {
      return this.editLegs((legs, m) => {
        if (legs.some((l) => l.place_id === place.id)) return `${place.name} is already in this mission.`
        const i = indexOfStop(legs, leg.place_id)
        if (i < 0) return STALE
        legs.splice(i, 1, userLeg(place, m, `Swapped in for ${leg.name}.`))
      }, `${leg.name} swapped for ${place.name}.`)
    },

    removeStop(leg) {
      return this.editLegs((legs) => {
        const i = indexOfStop(legs, leg.place_id)
        if (i < 0) return STALE
        if (legs.filter((l) => l.kind === 'visit').length <= 1) return 'A mission needs at least one stop. Swap it instead.'
        legs.splice(i, 1)
      }, `${leg.name} removed.`)
    },

    /** Move a pending stop one place earlier (-1) or later (+1) among the pending stops. */
    moveStop(leg, dir) {
      return this.editLegs((legs) => {
        const pending = legs.filter((l) => l.kind === 'visit' && l.status === 'pending')
        const i = pending.findIndex((l) => l.place_id === leg.place_id)
        if (i < 0) return STALE
        const other = pending[i + dir]
        if (!other) return null
        const a = legs.indexOf(pending[i])
        const b = legs.indexOf(other)
        ;[legs[a], legs[b]] = [legs[b], legs[a]]
      })
    },

    changeStay(leg, deltaMin) {
      return this.editLegs((legs) => {
        const l = legs[indexOfStop(legs, leg.place_id)]
        if (!l) return STALE
        const next = Math.min(240, Math.max(10, l.stay_min + deltaMin))
        if (next === l.stay_min) return null
        l.stay_min = next
        const place = placeById.value.get(l.place_id)
        if (place) l.xp = xpFor(place, next)
      })
    },

    /** Stamp the current leg's place. Server (RPC) or local adapter validates distance. */
    async stamp(leg, { dev = false } = {}) {
      const user = useUserStore()
      const ui = useUiStore()
      const passport = usePassportStore()
      const place = placeById.value.get(leg.place_id)
      if (!place) throw new Error('Unknown place')
      const db = await getDb()
      const position = hasFix() ? { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy } : null
      const { stamp, profile } = await db.stampPlace({
        userId: user.userId, place, position: dev && !position ? { lat: place.lat, lng: place.lng, accuracy: 5 } : position,
        fake: geo.fake || dev, dev, missionId: this.mission?.id, xp: leg.xp
      })
      user.setProfile(profile)
      const firstInArea = passport.addStamp({ ...stamp, area: place.area })
      if (this.mission) {
        const l = this.mission.legs.find((x) => x.seq === leg.seq)
        if (l) {
          l.status = 'stamped'
          l.stamped_at = stamp.stamped_at
        }
        await this.persist(this.mission)
      }
      ui.celebrate({ place, xp: leg.xp, firstInArea, area: place.area })
      return stamp
    },

    /** Stamp a place outside the mission (place page, sidequest arrival). */
    async stampPlaceDirect(place, xp = 40, opts = {}) {
      return this.stamp({ place_id: place.id, xp, seq: -1 }, opts)
    },

    async skip(leg) {
      const l = this.mission.legs.find((x) => x.seq === leg.seq)
      l.status = 'skipped'
      await this.persist(this.mission)
    },

    /** Back at the gate before arrive_by → on-time XP bonus. */
    async completeReturn() {
      const ret = this.returnLeg
      if (!ret || ret.status !== 'pending') return
      const onTime = now() <= Date.parse(ret.arrive_by)
      ret.status = 'stamped'
      ret.stamped_at = new Date(now()).toISOString()
      this.mission.completed = true
      await this.persist(this.mission)
      if (onTime) {
        const user = useUserStore()
        const db = await getDb()
        try { user.setProfile(await db.awardXp(user.userId, ret.xp)) } catch {}
      }
      useUiStore().celebrate({ returned: true, onTime, xp: onTime ? ret.xp : 0 })
    },

    slack() {
      if (!this.mission) return null
      return slackMinutes(this.mission, this.here(), now(), placeById.value)
    },

    leaveBy() {
      if (!this.mission) return null
      return leaveByMs(this.mission, this.here(), now())
    },

    /**
     * Sidequests near the traveller. Eligible only if the detour + stay + buffer fits
     * in the current slack; otherwise shown greyed out as "Not enough time".
     */
    nearbySidequests(position = this.here()) {
      if (!this.mission) return []
      const slack = this.slack()
      const next = this.nextLeg
      const nextPoint = next ? { lat: next.lat, lng: next.lng } : this.mission.origin
      const opts = { maxWalk: this.mission.prefs?.maxWalk, style: this.mission.style }
      const direct = travel(position, nextPoint, opts).minutes
      return SIDEQUESTS
        .map((sq) => ({ ...sq, place: placeById.value.get(sq.place_id) }))
        .filter((sq) => sq.place && !this.missionPlaceIds.has(sq.place_id) && !this.mission.sidequests_done?.includes(sq.id))
        .map((sq) => {
          const distance = distanceM(position, sq.place)
          const detour = travel(position, sq.place, opts).minutes + travel(sq.place, nextPoint, opts).minutes - direct
          const extra = Math.max(0, detour) + sq.stay_min
          return { ...sq, distance, extra_min: extra, eligible: slack != null && slack >= extra + SIDEQUEST_BUFFER_MIN }
        })
        .filter((sq) => sq.distance <= SIDEQUEST_RADIUS_M)
        .sort((a, b) => a.distance - b.distance)
    },

    /** Insert an accepted sidequest before the next leg and re-time the future. */
    async acceptSidequest(sq) {
      const m = this.mission
      const next = this.nextLeg
      const place = placeById.value.get(sq.place_id)
      const opts = { maxWalk: m.prefs?.maxWalk, style: m.style }
      const here = this.here()
      const tr = travel(here, place, { ...opts, atMs: now() })
      const arrive = now() + tr.minutes * 60000
      const depart = arrive + sq.stay_min * 60000
      const leg = {
        seq: 0, kind: 'visit', sidequest: true, sidequest_id: sq.id, place_id: place.id, name: place.name, area: place.area,
        lat: place.lat, lng: place.lng, indoor: place.indoor,
        arrive_iso: new Date(arrive).toISOString(), depart_iso: new Date(depart).toISOString(),
        travel_mode: tr.mode, travel_min: tr.minutes, travel_detail: tr.detail, stay_min: sq.stay_min,
        why: `Sidequest: ${sq.prompt}`, xp: sq.xp, status: 'pending'
      }
      const idx = next ? m.legs.indexOf(next) : m.legs.length - 1
      m.legs.splice(idx, 0, leg)
      retime(m, idx, depart, place, opts)
      m.sidequests_done = [...(m.sidequests_done || []), sq.id]
      await this.persist(m)
      useUiStore().toast(`Sidequest added: ${sq.title}`, 'success')
    }
  }
})

const STALE = 'That stop has changed. Refresh and try again.'

/** Index of a pending visit leg by place id, or -1. Never matches the return leg. */
function indexOfStop(legs, placeId) {
  return legs.findIndex((l) => l.kind === 'visit' && l.place_id === placeId)
}

/** A visit leg for a place the traveller chose by hand. Times are filled in by retimeMission. */
function userLeg(place, mission, why) {
  const stay = stayMinutes(place, mission.prefs || {})
  return {
    seq: 0, kind: 'visit', place_id: place.id, name: place.name, area: place.area,
    lat: place.lat, lng: place.lng, indoor: place.indoor,
    arrive_iso: mission.start_iso, depart_iso: mission.start_iso,
    travel_mode: 'walk', travel_min: 0, travel_detail: '', stay_min: stay,
    why, xp: xpFor(place, stay), status: 'pending', user_added: true
  }
}

/** Shift every leg after `idx` so times stay consistent after an insertion. */
function retime(m, idx, fromMs, fromPoint, opts) {
  let t = fromMs
  let cur = fromPoint
  for (let i = idx + 1; i < m.legs.length; i++) {
    const l = m.legs[i]
    const tr = travel(cur, l, { ...opts, atMs: t })
    const arrive = t + tr.minutes * 60000
    l.travel_min = tr.minutes
    l.travel_mode = tr.mode
    l.travel_detail = tr.detail
    l.arrive_iso = new Date(arrive).toISOString()
    l.depart_iso = new Date(arrive + l.stay_min * 60000).toISOString()
    t = arrive + l.stay_min * 60000
    cur = l
  }
  m.legs.forEach((l, i) => (l.seq = i + 1))
  const ret = m.legs.at(-1)
  m.buffer_min = Math.round((Date.parse(m.must_return_iso) - Date.parse(ret.arrive_iso)) / 60000)
}

function labelFor(mode) {
  return { behind: "I'm behind", 'less-walking': 'Less walking', swap: 'Stop swapped', rain: 'Rain plan' }[mode] || 'Replanned'
}
