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
import { previewJoin, withTravel, joinWindow, leaveWindow, getQuest, GuestModeError } from '../services/social.js'
import { restoreOnLeave } from '../services/joinResolver.js'

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
    missionPlaceIds() { return new Set(this.visitLegs.map((l) => l.place_id)) },
    /** The quest I've joined (as a guest): { id, title, host_name, from, to, blocks, startMs, endMs } or null. */
    joinedQuest() {
      for (const [id, info] of Object.entries(this.mission?.joined || {})) {
        const blocks = this.legs.filter((l) => l.fixed && l.party_id === id)
        if (blocks.length) return { id, ...info, blocks, startMs: Date.parse(blocks[0].arrive_iso), endMs: Date.parse(blocks.at(-1).depart_iso) }
      }
      return null
    },
    /** Where my own plan picks up after the joined stops: my next own stop, or heading back. */
    resumeLeg() {
      const q = this.joinedQuest
      if (!q) return null
      return this.legs.find((l) => l.kind === 'visit' && !l.fixed && l.status === 'pending' && Date.parse(l.arrive_iso) >= q.endMs) || this.returnLeg
    }
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
      const joined = upcomingJoined(m.legs)
      if (joined) {
        useUiStore().toast(`A rewrite would drop your stops with ${joined.with_host}. Leave that quest first.`, 'warning', 5000)
        return false
      }
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
        if (leg.fixed) return lockedMessage(leg)
        if (legs.some((l) => l.place_id === place.id)) return `${place.name} is already in this mission.`
        const i = indexOfStop(legs, leg.place_id)
        if (i < 0) return STALE
        legs.splice(i, 1, userLeg(place, m, `Swapped in for ${leg.name}.`))
      }, `${leg.name} swapped for ${place.name}.`)
    },

    removeStop(leg) {
      return this.editLegs((legs) => {
        if (leg.fixed) return lockedMessage(leg)
        const i = indexOfStop(legs, leg.place_id)
        if (i < 0) return STALE
        if (legs.filter((l) => l.kind === 'visit').length <= 1) return 'A mission needs at least one stop. Swap it instead.'
        legs.splice(i, 1)
      }, `${leg.name} removed.`)
    },

    /** Move a pending stop one place earlier (-1) or later (+1) among the pending stops. */
    moveStop(leg, dir) {
      return this.editLegs((legs) => {
        if (leg.fixed) return lockedMessage(leg)
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
        if (l.fixed) return lockedMessage(l)
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

    // ── Social quests: joining part of someone's open window (docs/social-quests-spec.md) ──

    /**
     * Join stops from..to of a quest. Server first (capacity, range, airport time), then my plan
     * changes exactly as previewJoin showed: joined stops become fixed blocks, overlapping or too-close
     * own stops are removed (and remembered, to bring back if I leave). Nothing else moves.
     * Throws with a message for the confirm sheet.
     */
    async joinQuest(quest, from, to) {
      const m = this.mission
      if (!m) throw new Error('Plan your layover first.')
      const other = upcomingJoined(m.legs)
      if (other && other.party_id !== quest.id) throw new Error(`You're already with ${other.with_host}. Leave that quest first.`)
      const res = previewJoin(quest, from, to, m)
      if (!res.ok) throw new Error(res.reason)
      await joinWindow({ quest, from, to, mission: m })
      const next = JSON.parse(JSON.stringify(m))
      next.legs = withTravel(res.legs, m)
      next.joined = {
        ...(m.joined || {}),
        [quest.id]: { title: quest.title, host_name: res.hostName, from, to, removed: res.removed.map((r) => ({ ...r.leg, removed_why: r.why })) }
      }
      setTotals(next)
      try {
        await this.persist(next)
      } catch (err) {
        // Saving my plan failed: undo the join so the server and my plan agree.
        await leaveWindow(quest.id).catch(() => {})
        throw err
      }
      return res
    },

    /**
     * Leave a quest ("Go solo", or the host changed/closed it): drop its fixed blocks and bring back
     * removed own stops that still pass the overlap and gap checks. `server: false` when the
     * database already removed me. Returns { restored, dropped }.
     */
    async leaveQuest(partyId, { server = true } = {}) {
      const m = this.mission
      if (!m) return { restored: [], dropped: [] }
      if (server) await leaveWindow(partyId)
      const info = m.joined?.[partyId]
      const res = restoreOnLeave({ legs: m.legs, removed: info?.removed || [], partyId, nowMs: now() })
      const next = JSON.parse(JSON.stringify(m))
      next.legs = withTravel(res.legs, m)
      next.joined = { ...(m.joined || {}) }
      delete next.joined[partyId]
      setTotals(next)
      await this.persist(next)
      return res
    },

    /**
     * Am I still in the quests my plan says I joined? The host can close the quest or change my
     * stops (update_window removes me). If not, go back to my own plan and say why.
     */
    async checkJoined() {
      await this.finishEndedQuests()
      const ids = Object.keys(this.mission?.joined || {})
      for (const id of ids) {
        let q
        try { q = await getQuest(id) } catch (err) {
          if (err instanceof GuestModeError) return
          continue // offline: check again next time
        }
        if (q && q.mine && q.status !== 'closed') continue
        const host = this.mission.joined[id].host_name
        await this.leaveQuest(id, { server: false })
        useUiStore().toast(`${host} changed their plan, so you're back on your own.`, 'warning', 6000)
      }
    },

    /** My joined stops are over: back to my own plan automatically (called on load and by the map chip). */
    async finishEndedQuests() {
      if (finishing) return
      finishing = true
      try {
        for (const [id, info] of Object.entries(this.mission?.joined || {})) {
          const blocks = this.legs.filter((l) => l.fixed && l.party_id === id)
          if (blocks.length && Date.parse(blocks.at(-1).depart_iso) > now()) continue
          // Free me on the server too (one quest at a time); fine if the quest is already gone.
          try { await leaveWindow(id) } catch {}
          await this.leaveQuest(id, { server: false })
          const next = this.nextLeg
          await usePartyStore().notice({
            title: `Your stops with ${info.host_name} are done`, icon: 'bi-flag-fill', tone: 'success',
            body: `You'll carry on with your own plan${next?.kind === 'visit' ? `. Next up: ${next.name}` : ', heading back'}.`
          })
        }
      } finally {
        finishing = false
      }
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
      const joined = upcomingJoined(m.legs)
      if (joined) {
        useUiStore().toast(`Sidequests are paused while you have stops with ${joined.with_host}: they'd push your meet-up later.`, 'warning', 5000)
        return
      }
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
let finishing = false // finishEndedQuests is running (the map chip calls it every few seconds)

/** A joined stop (fixed time, with someone) still ahead of me, if any. */
function upcomingJoined(legs) {
  return legs.find((l) => l.fixed && l.status === 'pending') || null
}
function lockedMessage(leg) {
  return `${leg.name} is with ${leg.with_host} at a fixed time. Leave the quest to change it.`
}
/** Keep the summary numbers in step after a join/leave changed which stops are in the plan. */
function setTotals(m) {
  const home = Date.parse(m.legs.find((l) => l.kind === 'return').arrive_iso)
  m.total_out_min = Math.round((home - Date.parse(m.start_iso)) / 60000) - m.buffers.exit_min
  m.buffer_min = Math.round((Date.parse(m.must_return_iso) - home) / 60000)
}

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
