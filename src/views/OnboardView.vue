<script setup>
import {computed, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import {useUserStore} from '../stores/user.js';
import {STYLES} from '../data/origins.js';

/* Steven: Four question quiz after user authentication */

const user = useUserStore();
const router = useRouter();
const route = useRoute();

const QUESTIONS = [
    {
        q: 'You land with 8 free hours. First move?', 
        a: [
            {t: 'Find the cheapest great meal', s: 'budget'}, 
            {t: 'Get up high for the skyline', s: 'adventurous'},
            {t: 'Find where the locals hang out tonight', s: 'party'}, 
            {t: 'A calm museum near the train', s: 'conservative'}
        ] 
    },
    {
        q: 'It starts pouring. You…', 
        a: [
            {t: 'Duck into a hawker centre', s: 'budget'}, 
            {t: 'Keep walking, it’s just water', s: 'adventurous'},
            {t: 'Rooftop bar with a roof', s: 'party'}, 
            {t: 'Straight to an indoor gallery', s: 'conservative'}
        ] 
    },
    {
        q: 'Your ideal buffer before boarding?', 
        a: [
            {t: 'Whatever keeps it cheap', s: 'budget'}, 
            {t: 'Tight. Maximise the city', s: 'adventurous'},
            {t: 'Enough for one more drink', s: 'party'}, 
            {t: 'Big. I hate running.', s: 'conservative'}
        ] 
    },
    {
        q: 'Pick a souvenir.', 
        a: [
            {t: 'Kaya jam from a kopitiam', s: 'budget'}, 
            {t: 'A summit photo', s: 'adventurous'},
            {t: 'A blurry night-out selfie', s: 'party'}, 
            {t: 'A museum postcard', s: 'conservative'}
        ] 
    }
];

const step = ref(0);
const picks = ref([]);
const chosen = ref(null);
const saving = ref(false);

const result = computed(() => {
    const count = {};
    picks.value.forEach((s) => (count[s] = (count[s] || 0) + 1));
    return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || 'budget';
});

function answer(style) {
    picks.value[step.value] = style;
    if (step.value < QUESTIONS.length - 1) {
        step.value++;
    } else {
        chosen.value = result.value;
    }
}

async function save() {
    saving.value = true;
    await user.updateProfile({style: chosen.value});
    saving.value = false;
    router.replace(typeof route.query.next === 'string' ? route.query.next : '/plan');
}
</script>

<template>
    <main class="zt-page" style="max-width: 560px">
        <div 
            class="progress mb-4" 
            style="height: 8px" 
            role="progressbar" 
            :aria-valuenow="chosen ? 4 : step" 
            aria-valuemin="0" 
            aria-valuemax="4">
            <div 
                class="progress-bar" 
                :style="{width: ((chosen ? 4 : step) / 4) * 100 + '%', background: 'var(--zt-pink)'}">
            </div>
        </div>

        <div v-if="!chosen" class="zt-card p-4">
            <span class="zt-pill mb-2">Question {{ step + 1 }} of {{ QUESTIONS.length }}</span>
            <h1 class="question mb-3">{{ QUESTIONS[step].q }}</h1>
            
            <div class="d-grid gap-2">
                <button 
                    v-for="a in QUESTIONS[step].a" 
                    :key="a.t" 
                    class="btn btn-soft text-start py-3 px-3 answer" 
                    @click="answer(a.s)">
                    {{ a.t }}
                </button>
            </div>
            
            <button v-if="step > 0" class="btn btn-link mt-2 px-0" @click="step--">
                <i class="bi bi-arrow-left"></i> Back
            </button>
        </div>

        <div v-else class="zt-card p-4 text-center">
            <p class="text-muted mb-1">You travel like a…</p>
            
            <div 
                class="style-badge mx-auto my-3" 
                :style="{background: STYLES[chosen].color, color: STYLES[chosen].on}">
                <i class="bi" :class="STYLES[chosen].icon"></i>
            </div>
            
            <h1 class="result">{{ STYLES[chosen].label }} traveller</h1>
            <p class="text-muted">{{ STYLES[chosen].blurb }}</p>
            
            <p class="tiny text-muted">Not quite? Pick another:</p>
            <div class="d-flex flex-wrap justify-content-center gap-2 mb-4">
                <button 
                    v-for="(s, id) in STYLES" 
                    :key="id" 
                    class="zt-chip" 
                    :class="{active: chosen === id}" 
                    @click="chosen = id" 
                    :aria-pressed="chosen === id">
                    <i class="bi" :class="s.icon"></i>{{ s.label }}
                </button>
            </div>
            
            <button class="btn btn-primary btn-lg px-5" :disabled="saving" @click="save">
                Plan my layover
            </button>
        </div>
    </main>
</template>

<style scoped>
.answer {
    border-radius: 16px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.95rem;
}
.question {
    font-size: 2.1rem;
}
.style-badge {
    width: 96px;
    height: 96px;
    border-radius: 28px;
    display: grid;
    place-items: center;
    font-size: 2.6rem;
    transform: rotate(-6deg);
    border: var(--zt-bw) solid var(--zt-line);
    box-shadow: var(--zt-shadow);
}
.result {
    font-size: 2.6rem;
}
</style>