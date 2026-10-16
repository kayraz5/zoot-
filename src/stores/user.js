import { defineStore } from 'pinia';

import { HAS_SUPABASE } from '../lib/config.js';
import { levelFor, titleFor } from '../lib/xp.js';

/* Steven: User Profile Authentication & Session */

export const useUserStore = defineStore('user', {
    // initial state
    state: () => ({
        session: null,
        profile: null,
        ready: false,
        mode: 'local',
        _init: null
    }),
    // getters (encapsulate field retrieval)
    getters: {
        isAuthed: (s) => Boolean(s.session?.user),
        userId: (s) => s.session?.user?.id || null,
        needsOnboarding: (s) => Boolean(s.session?.user) && !s.profile?.style,
        level: (s) => levelFor(s.profile?.xp || 0),
        canUseEmail: () => HAS_SUPABASE,
        title() { 
            return titleFor(this.level.level) 
        },
    },
    // define methods & actions
    actions: {
        init() {
            if (!this._init) {
                this._init = this._load();
                return this._init;
            }
        },
        // load session
        async _load() {

        },
        // // refresh the profile
        // async refreshProfile() {

        // },
        // set session to guest account
        async continueAsGuest(name) {

        },
        // magic link to authenticate with email without password
        async sendMagicLink(email) {

        },
        // email and password login
        async passwordAuth(email, password, isSignUp = false) {

        },
        // update profiles with specified updates
        async updateProfile(updates) {

        },
        // set profile
        setProfile(profile) {

        },
        // sign out and empty the session
        async signOut() {

        }
    }
})