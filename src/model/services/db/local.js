import {checkInStatus, sameSgDay} from '../checkin.js';
import {DEFAULT_COVER} from '../brand.js';

/* Steven: guest-mode adapter, will fallback to local if database is down also */

/* 
    Leverages localStorage to store the guest data.
    Have almost the same function definitions as remote.js.
*/

// website state constructor
const state = { 
    session: 'zoot.session',
    profile: 'zoot.profile',
    trips: 'zoot.trips',
    missions: 'zoot.missions',
    stamps: 'zoot.stamps',
};

// read cookies
function read(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback
    } catch (err) {
        console.error(err);
        return fallback
    }
}

// write to cookies
function write(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch (err) {
        console.error(err);
    }
}

export const localDb = {
    kind: 'local',

    async getSession() {
        return read(state.session, null)
    },
    onAuthChange() {
        return () => {};
    },
    async signInGuest(displayName) {
        let profile = read(state.profile, null);
        if (!profile) {
            const id = 'guest-' + crypto.randomUUID();

            // initial guest profile
            profile = {
                id,
                display_name: displayName || 'Field Traveller',
                style: null,
                xp: 0,
                home_city: null,
                is_verified: false,
                avatar_seed: Math.floor(Math.random() * 1e6),
                cover_color: DEFAULT_COVER,
                created_at: new Date().toISOString(),
            };

            write(state.profile, profile);

        } else if (displayName) {
            profile.display_name = displayName;
            write(state.profile, profile);
        }

        const session = {
            user: {
                id: profile.id,
                email: null,
            },
            guest: true,
        }

        write(state.session, session);
        return session;
    },
    async signInWithEmail() {
        throw new Error('Email sign-in needs Supabase keys. Use guest mode for now.');
    },
    async signInWithPassword() {
        throw new Error('Password sign-in needs Supabase keys. Use guest mode for now.');
    },
    async signUpWithPassword() {
        throw new Error('Password sign-up needs Supabase keys. Use guest mode for now.');
    },
    async signOut() {
        localStorage.removeItem(state.session);
    },

    async getProfile(id) {
        const profile = read(state.profile, null);
        return profile && profile.id === id ? profile : null;
    },
    async updateProfile(id, patch) {
        const profile = {
            ...read(state.profile, {}),
            ...patch,
            id,
        }

        write(state.profile, profile);
        return profile;
    },
    async awardXp(id, amount) {
        const profile = read(state.profile, null);
        
        if (!profile || profile.id !== id) {
            return null;
        }
        
        profile.xp = (profile.xp || 0) + amount;
        write(state.profile, profile);

        return profile;
    },

    async listPlaces() {
        return []
    },

    async saveTrip(trip) {
        const trips = read(state.trips, []);
        const row = {
            ...trip, 
            id: trip.id || crypto.randomUUID(),
            created_at: new Date().toISOString(),
        }

        write(state.trips, [
            row,
            ...trips.filter(t => t.id !== row.id).slice(0, 20)
        ])

        return row;
    },

    async saveMission(mission) {
        const all = read(state.missions, {});
        all[mission.id] = mission;
        
        write(state.missions, all);

        return missions;
    },
    async getMission(id) {
        return read(state.missions, {})[id] || null;
    },
    async listMissions() {
        return Object.values(
            read(state.missions, {}).sort(
                (a,b) => b.created_at.localeCompare(a.created_at)
            )
        )
    },
    
    async stampPlace({
        userId, 
        place, 
        position, 
        fake, 
        missionId, 
        xp, 
        dev}) {
            if (!dev) {
                const status = checkInStatus({place, position, fake});
                if (!status.ok) {
                    throw new Error(s.message);
                }
            }

            const stamps = read(state.stamps, []);
            const now = Date.now()
            
            if (stamps.some(s => {
                return s.user_id === userId && s.place_id === place.id && sameSgDay(Date.parse(s.stamped_at), now)
            })) {
                throw new Error('Already stamped here today. One chop per place per day.');
            }
            const stamp = {
                id: crypto.randomUUID(),
                user_id: userId,
                place_id: place.id,
                mission_id: missionId || null,
                lat: position?.lat ?? place.lat,
                lng: position?.lng ?? place.lng,
                accuracy_m: position?.accuracy ?? null,
                xp,
                area: place.area, 
                stamped_at: new Date(now).toISOString()
            }

            stamps.push(stamp);
            write(state.stamps, stamps);
            const profile = await this.awardXp(userId, xp);

            return {stamp, profile};
    },
    async listStamps(userId) {
        return read(state.stamps, []).filter(s => s.user_id === userId);
    }
}