<script setup>
import {computed, defineAsyncComponent, ref} from 'vue';
import {useRouter} from 'vue-router';
import {useUserStore} from '../../model/stores/user.js';
import {usePassportStore} from '../../model/stores/passport.js';
import {useUiStore} from '../../model/stores/ui.js';
import {STYLES} from '../../model/data/origins.js';
import {DEV_PANEL} from '../../model/services/config.js';
import {COVERS, DEFAULT_COVER, onColor} from '../../model/services/brand.js';
import {useCharacterStore} from '../../model/stores/character.js';
import EntryCheck from '../components/EntryCheck.vue';

// Loaded only when the Character tab is opened. The studio pulls in all of
// Three.js (~540 kB), and most visits to this page are just checking XP or
// signing out — no reason to make those pay for a 3D engine they never see.
const CharacterStudio = defineAsyncComponent(() => import('../components/CharacterStudio.vue'));

/* Steven: Profile view (except passport, only entry point here) */

const user = useUserStore();
const passport = usePassportStore();
const ui = useUiStore();
const router = useRouter();

const editing = ref(false);
const name = ref(user.profile?.display_name || '');

// ── Character tab ────────────────────────────────────────────────────────
const tab = ref('profile');          // 'profile' | 'character'
const character = useCharacterStore();

// Draft copies. The studio edits these, so the preview updates as you click,
// but nothing reaches the map until you press Save — which is what makes Save
// mean something instead of being decoration.
const draftOutfit = ref(character.outfit);
const draftFur = ref(character.fur);
const draftHat = ref(character.hat);
const draftEyewear = ref(character.eyewear);

const unsaved = computed(() =>
    draftOutfit.value !== character.outfit ||
    draftFur.value !== character.fur ||
    draftHat.value !== character.hat ||
    draftEyewear.value !== character.eyewear);

function saveLook() {
    character.save({
        outfit: draftOutfit.value, fur: draftFur.value,
        hat: draftHat.value, eyewear: draftEyewear.value
    });
    ui.toast('Look saved — your traveller is wearing it on the map.', 'dark');
}

function revertLook() {
    draftOutfit.value = character.outfit;
    draftFur.value = character.fur;
    draftHat.value = character.hat;
    draftEyewear.value = character.eyewear;
}

const style = computed(() => STYLES[user.profile?.style] || STYLES.budget);
const cover = computed(() => user.profile?.cover_color || DEFAULT_COVER);

async function saveName() {
    await user.updateProfile({display_name: name.value.trim() || 'Field Traveller'});
    editing.value = false;
}

async function signOut() {
    await user.signOut();
    router.push('/');
}
</script>

<template>
    <main class="zt-page">
        <section class="zt-card p-4 text-center hero">
            <div class="avatar mx-auto mb-2" :style="{background: cover, color: onColor(cover)}">
                <i class="bi bi-person-walking"></i>
                <span class="lvl">L{{ user.level.level }}</span>
            </div>
            
            <div v-if="!editing" class="d-flex justify-content-center align-items-center gap-2">
                <h1 class="name mb-0">{{ user.profile?.display_name }}</h1>
                <button class="btn btn-sm btn-link p-0" @click="editing = true" aria-label="Edit name">
                    <i class="bi bi-pencil"></i>
                </button>
            </div>
            
            <form v-else class="d-flex gap-2 justify-content-center" @submit.prevent="saveName">
                <input 
                    v-model="name" 
                    class="form-control form-control-sm" 
                    style="max-width: 200px" 
                    maxlength="32" 
                    aria-label="Display name" 
                />
                <button class="btn btn-sm btn-primary">Save</button>
            </form>
            
            <div class="text-muted small">
                {{ user.title }} · <i class="bi" :class="style.icon"></i> {{ style.label }} traveller
            </div>
            
            <div class="xp mt-3">
                <div class="d-flex justify-content-between tiny fw-800">
                    <span>{{ user.profile?.xp || 0 }} XP</span>
                    <span>L{{ user.level.level + 1 }} at {{ user.level.next }}</span>
                </div>
                <div class="progress" style="height: 10px">
                    <div class="progress-bar" :style="{width: user.level.progress * 100 + '%'}"></div>
                </div>
            </div>
            
            <div class="row g-2 mt-3 stats">
                <div class="col">
                    <b>{{ passport.stamps.length }}</b>
                    <span>stamps</span>
                </div>
                <div class="col">
                    <b>{{ passport.chopCount }}</b>
                    <span>chops</span>
                </div>
                <div class="col">
                    <b>{{ passport.seen.size }}</b>
                    <span>places seen</span>
                </div>
            </div>
        </section>

        <!-- The hero above stays put on both tabs — it's who you are. Only the
             panels below it swap. -->
        <nav class="zt-tabs mt-3" role="tablist" aria-label="Profile sections">
            <button
                role="tab"
                :aria-selected="tab === 'profile'"
                :class="{active: tab === 'profile'}"
                @click="tab = 'profile'">
                <i class="bi bi-person-badge"></i> Profile
            </button>
            <button
                role="tab"
                :aria-selected="tab === 'character'"
                :class="{active: tab === 'character'}"
                @click="tab = 'character'">
                <i class="bi bi-person-arms-up"></i> Character
            </button>
        </nav>

        <template v-if="tab === 'profile'">
        <!-- Shrey's entry check (b92164e); dropped in a later merge, restored. -->
        <EntryCheck />

        <section class="zt-card p-3 mt-3">
            <div class="small fw-800 mb-2">Passport cover</div>
            <div class="d-flex gap-2">
                <button 
                    v-for="c in COVERS" 
                    :key="c" 
                    class="swatch" 
                    :class="{active: cover === c}" 
                    :style="{background: c}" 
                    :aria-label="`Cover colour ${c}`" 
                    @click="user.updateProfile({cover_color: c})">
                </button>
            </div>
        </section>

        <div class="list-group mt-3 zt-card overflow-hidden">
            <RouterLink to="/codex" class="list-group-item list-group-item-action">
                <i class="bi bi-grid-3x3-gap"></i> City Codex
            </RouterLink>
            <RouterLink to="/swipe" class="list-group-item list-group-item-action">
                <i class="bi bi-gem"></i> Sidequest deck
            </RouterLink>
            <RouterLink to="/plan" class="list-group-item list-group-item-action">
                <i class="bi bi-plus-circle"></i> Plan a new layover
            </RouterLink>
            <RouterLink to="/onboard" class="list-group-item list-group-item-action">
                <i class="bi bi-shuffle"></i> Retake the style quiz
            </RouterLink>
            <RouterLink to="/quests" class="list-group-item list-group-item-action">
                <i class="bi bi-people"></i> Group quests
            </RouterLink>
            
            <button class="list-group-item list-group-item-action" @click="ui.toggleTheme()">
                <i class="bi" :class="ui.theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'"></i> 
                {{ ui.theme === 'dark' ? 'Light' : 'Dark' }} mode
            </button>
            
            <RouterLink v-if="DEV_PANEL" to="/dev" class="list-group-item list-group-item-action">
                <i class="bi bi-joystick"></i> Dev panel
            </RouterLink>
        </div>

        <section class="zt-card p-3 mt-3 small">
            <div class="fw-800 mb-1">
                <i class="bi bi-passport"></i> Entering Singapore on a layover
            </div>
            <p class="text-muted mb-2">
                Many passport holders can enter visa-free for short stays, and arrivals must submit the SG Arrival Card before landing. Rules change, so always confirm with ICA before you leave the airport.
            </p>
            <div class="d-flex gap-2 flex-wrap">
                <a class="btn btn-soft btn-sm" href="https://www.ica.gov.sg/enter-transit-depart/entering-singapore" target="_blank" rel="noopener">ICA entry rules</a>
                <a class="btn btn-soft btn-sm" href="https://www.trip.com/flights/" target="_blank" rel="noopener">Search flights</a>
            </div>
        </section>

        <p class="tiny text-muted text-center mt-3">
            Signed in via {{ user.mode === 'supabase' ? 'Supabase' : 'guest mode (this device)' }}
        </p>
        <button class="btn btn-outline-danger w-100" @click="signOut">
            <i class="bi bi-box-arrow-right"></i> Sign out
        </button>
        </template>

        <!-- Character tab. CharacterStudio is the same component /wardrobe uses,
             so there's one dressing room, not two that drift apart. It edits the
             draft refs; only Save pushes them into the store that the 3D map
             reads. -->
        <section v-else class="zt-card p-3 mt-3">
            <div class="small fw-800 mb-1">Your traveller</div>
            <p class="tiny text-muted mb-3">
                Drag to spin. Mix an outfit, hat, eyewear and fur however you like, then save — the 3D map uses whatever you save here.
            </p>

            <Suspense>
                <CharacterStudio
                    v-model:outfit="draftOutfit"
                    v-model:fur="draftFur"
                    v-model:hat="draftHat"
                    v-model:eyewear="draftEyewear">
                    <template #actions>
                        <div class="d-flex gap-2 mt-3 align-items-center flex-wrap">
                            <button class="btn btn-primary" :disabled="!unsaved" @click="saveLook">
                                <i class="bi bi-check2"></i> Save look
                            </button>
                            <button v-if="unsaved" class="btn btn-soft btn-sm" @click="revertLook">
                                Undo changes
                            </button>
                            <span v-if="unsaved" class="tiny text-muted">Unsaved</span>
                            <span v-else class="tiny text-muted">
                                <i class="bi bi-check-circle"></i> Saved &middot; worn on the map
                            </span>
                        </div>
                    </template>
                </CharacterStudio>

                <!-- Shown while the 3D chunk downloads. -->
                <template #fallback>
                    <div class="studio-loading">
                        <div class="spinner-border" role="status"><span class="visually-hidden">Loading</span></div>
                    </div>
                </template>
            </Suspense>
        </section>
    </main>
</template>

<style scoped>
/* Segmented tab control: two halves of one outlined pill, matching the sticker
   look the rest of the app uses (thick border, hard shadow, yellow when on). */
.zt-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border: var(--zt-bw) solid var(--zt-line);
    border-radius: 999px;
    overflow: hidden;
    box-shadow: var(--zt-shadow-sm);
    background: var(--zt-card);
}
.zt-tabs button {
    border: 0;
    background: none;
    color: var(--zt-ink);
    font-family: var(--zt-font-head);
    font-weight: 600;
    padding: 0.55rem 0.5rem;
    cursor: pointer;
}
.zt-tabs button + button { border-left: var(--zt-bw) solid var(--zt-line); }
.zt-tabs button.active { background: var(--zt-yellow); color: var(--zt-on-yellow); }

.studio-loading {
    display: grid;
    place-items: center;
    min-height: min(52dvh, 420px);
    color: var(--zt-muted);
}

.hero {
    background: var(--zt-card);
}
.name {
    font-size: 2.2rem;
}
.avatar {
    width: 96px;
    height: 96px;
    border-radius: 30px;
    display: grid;
    place-items: center;
    font-size: 2.6rem;
    position: relative;
    transform: rotate(-4deg);
    border: var(--zt-bw) solid var(--zt-line);
    box-shadow: var(--zt-shadow);
}
.lvl {
    position: absolute;
    bottom: -10px;
    right: -12px;
    background: var(--zt-pink);
    color: #111;
    font-size: 0.74rem;
    font-weight: 800;
    border: 2px solid #111;
    border-radius: 999px;
    padding: 1px 8px;
    transform: rotate(6deg);
}
.stats b {
    display: block;
    font-family: var(--zt-font-display);
    font-size: 2.2rem;
    line-height: 1;
    font-weight: 400;
}
.stats span {
    font-size: 0.66rem;
    color: var(--zt-muted);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.swatch {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    border: var(--zt-bw) solid var(--zt-line);
}
.swatch.active {
    box-shadow: 0 0 0 3px var(--zt-card), 0 0 0 6px var(--zt-pink);
}
.list-group {
    border: var(--zt-bw) solid var(--zt-line);
    border-radius: var(--zt-radius);
}
.list-group-item {
    display: flex;
    gap: 10px;
    align-items: center;
    font-weight: 700;
    font-size: 0.86rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    background: var(--zt-card);
    color: var(--zt-ink);
    border-left: none;
    border-right: none;
}
.list-group-item:hover {
    background: var(--zt-yellow-soft);
    color: #111;
}
</style>