import {defineStore} from 'pinia';
import {getDb, isGuestMode, setGuestMode} from '../services/db/index.js';
import {HAS_SUPABASE} from '../services/config.js';
import {levelFor, titleFor} from '../services/xp.js';

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
            return titleFor(this.level.level);
        }
    },
    
    // define methods & actions
    actions: {
        init() {
            if (!this._init) {
                this._init = this._load();
            }
            return this._init;
        },
        
        // load session
        async _load() {
            const db = await getDb();
            this.mode = db.kind;
            this.session = await db.getSession();
            
            if (this.session?.user) {
                await this.refreshProfile();
            }
            
            db.onAuthChange(async (session) => {
                this.session = session;
                if (session?.user) {
                    await this.refreshProfile();
                } else {
                    this.profile = null;
                }
            });
            
            this.ready = true;
        },
        
        // refresh the profile
        async refreshProfile() {
            const db = await getDb();
            let p = await db.getProfile(this.userId);
            
            // The signup trigger creates the row; if it has not landed yet, create a minimal one.
            if (!p && db.kind === 'supabase') {
                p = await db.updateProfile(this.userId, {display_name: this.session.user.email?.split('@')[0]});
            }
            
            this.profile = p;
        },
        
        // set session to guest account
        async continueAsGuest(name) {
            setGuestMode(true);
            this._init = null;
            
            const db = await getDb();
            this.mode = db.kind;
            this.session = await db.signInGuest(name);
            
            await this.refreshProfile();
            this.ready = true;
        },
        
        // magic link to authenticate with email without password
        async sendMagicLink(email) {
            setGuestMode(false);
            this._init = null;
            
            const db = await getDb();
            await db.signInWithEmail(email);
        },
        
        // email and password login
        async passwordAuth(email, password, isSignUp = false) {
            setGuestMode(false);
            this._init = null;
            
            const db = await getDb();
            this.mode = db.kind;
            
            const session = isSignUp 
                ? await db.signUpWithPassword(email, password) 
                : await db.signInWithPassword(email, password);
                
            if (!session) {
                return false;
            }
            
            this.session = session;
            await this.refreshProfile();
            this.ready = true;
            
            return true;
        },
        
        // update profiles with specified updates
        async updateProfile(updates) {
            const db = await getDb();
            this.profile = await db.updateProfile(this.userId, updates);
        },
        
        // set profile
        setProfile(profile) {
            if (profile) {
                this.profile = profile;
            }
        },
        
        // sign out and empty the session
        async signOut() {
            const db = await getDb();
            await db.signOut();
            
            this.session = null;
            this.profile = null;
            
            if (HAS_SUPABASE && isGuestMode()) {
                setGuestMode(false);
            }
            
            this._init = null;
        }
    }
});