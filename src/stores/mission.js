import { defineStore } from 'pinia'
import { getDb } from '../lib/db/index.js'
import { buildMission } from '../lib/groq.js'
import { catalog, placeById, loadCatalog } from '../lib/catalog.js'
import { keptVisits, slackMinutes, leaveByMs } from '../lib/planner.js'
import { travel, distanceM } from '../lib/travel.js'
import { rainLookup } from '../lib/weather.js'
import { now } from '../lib/clock.js'
import { geo, hasFix } from '../lib/geo.js'
import { SIDEQUESTS } from '../data/sidequests.js'
import { useUiStore } from './ui.js'
import { useUserStore } from './user.js'
import { usePassportStore } from './passport.js'

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
