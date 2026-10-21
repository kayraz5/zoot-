import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

/* Steven: Supabase adaptor */

/*
    Main Supabase connector.
    Have the same function definitions as local.js, except Google Sign-ins
*/

export function createRemoteDb() {
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        }
    }) 

    const must = ({ data, error }) => {
        if (error) {
            throw new Error(error.message);
        }
        return data;
    }

    return {
        kind: 'supabase',
        client: db,

        async getSession() {
            const { data } = await db.auth.getSession();
            return data.session;
        },
        onAuthChange(cb) {
            const { data } = db.auth.onAuthStateChange((_event, session) => cb(session));
            return () => data.subscription.unsubscribe();
        },
        async signInWithEmail(email) {
            must(await db.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/auth` } }));
        },
        async signInWithPassword(email, password) {
            return must(await db.auth.signInWithPassword({ email, password })).session;
        },
        async signUpWithPassword(email, password) {
            return must(await db.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth` } })).session;
        },
        // not widely implemented yet
        async signInWithGoogle() {
            must(await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth` } }));
        },
        async signOut() {
            await db.auth.signOut();
        },

        async getProfile(id) {
            return must(await db.from('profiles').select('*').eq('id', id).maybeSingle());
        },
        async updateProfile(id, updates) {
            return must(await db.from('profiles').upsert({ id, ...updates }).select().single());
        },
        async awardXp(id, amount) {
            return must(await db.rpc('award_return_bonus', { p_amount: amount }));
        },

        async listPlaces() {
            return must(await db.from('places').select('*').order('name'));
        },

        async saveTrip(trip) {
            const row = {
                user_id: trip.user_id,
                origin_label: trip.origin.label,
                origin_lat: trip.origin.lat,
                origin_lng: trip.origin.lng,
                origin_kind: trip.origin.kind,
                start_at: trip.start_at,
                must_return_at: trip.must_return_at,
                style: trip.style,
                interests: trip.interests,
                energy: trip.energy,
                status: 'planned',
            }
            const saved = must(await db.from('trips').insert(row).select().single())
            return { ...trip, id: saved.id }
        },

        async saveMission(mission) {
            must(await db.from('missions').upsert({
                id: mission.id,
                trip_id: mission.trip_id,
                title: mission.title,
                payload_json: mission,
                buffer_min: mission.buffer_min,
                groq_model: mission.groq_model,
                fallback_used: mission.fallback_used,
            }));
            must(await db.from('mission_legs').delete().eq('mission_id', mission.id));
            must(await db.from('mission_legs').insert(mission.legs.map(l => {
                return {
                    mission_id: mission.id,
                    seq: l.seq,
                    kind: l.kind,
                    place_id: l.kind === 'return' ? null : l.place_id,
                    travel_mode: l.travel_mode,
                    travel_min: l.travel_min,
                    stay_min: l.stay_min,
                    xp: l.xp,
                    status: l.status,
                    arrive_at: l.arrive_iso,
                    depart_at: l.depart_iso,
                }
            })))

            return mission;
        },
        async getMission(id) {
            const row = must(await db.from('missions').select('payload_json').eq('id', id).maybeSingle());
            return row?.payload_json || null;
        },
        async listMissions() {
            const rows = must(await db.from('missions').select('payload_json'))
            return rows
                .map((r) => r.payload_json)
                .filter(Boolean)
                .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
        },

        async stampPlace({
            place,
            position,
            fake,
            missionId
        }) {
            const stamp = must(await db.rpc('stamp_place', {
                p_place_id: place.id,
                p_lat: position?.lat,
                p_lng: position?.lng,
                p_accuracy: position?.accuracy ?? 999,
                p_mission_id: missionId || null,
                p_fake_gps: Boolean(fake),
            }))
            const { data: { user } } = await db.auth.getUser();
            const profile = user ? await this.getProfile(user.id) : null;
            return { stamp: { ...stamp, area: place.area }, profile };
        },
        async listStamps(userId) {
            return must(await db.from('stamps').select('*, places(area)').eq('user_id', userId).order('stamped_at'))
                .map((s) => ({ ...s, area: s.places?.area }));
        },
    };
};