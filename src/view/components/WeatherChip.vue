<script setup>
import { computed } from 'vue'
import { useUiStore } from '../../model/stores/ui.js'
import { describeCode, describePsi } from '../../model/services/weather.js'
import { tick } from '../../model/services/clock.js'

const ONE_HOUR_MS = 60 * 60 * 1000;
const WET_THRESHOLD = 60;
const DEV_RAIN_CHANCE = 90;

// Holds the forecast (ui.weather) and dev switch (ui.forceRain)
const ui = useUiStore()

const haze = computed(() => {
    if (!ui.shownHaze) return null
    return { psi: ui.shownHaze.psi, ...describePsi(ui.shownHaze.psi) }
})
const lightningNearby = computed(() => ui.shownLightning?.nearby === true)

// ---------------------------------------------------------------
// Find the forecast for the current hour
// ---------------------------------------------------------------

// Each forecast hour has a start time (h.ms) and lasts one hour
const currentHour = computed(() => {
    const hours = ui.weather?.hours; // '?.' means only continue if this exists, so we get undefined (not error) while the forecast is still loading
    if (!hours) return undefined;

    return hours.find((h) => {
        // 'tick' is the app's reactive clock, so it updates as time passes
        const startsBeforeNow = tick.value >= h.ms;
        const endsAfterNow = tick.value < h.ms + ONE_HOUR_MS;
        return startsBeforeNow && endsAfterNow;
    });
})

// ---------------------------------------------------------------
// Build the info the chip displays
// ---------------------------------------------------------------

// Returns one object: { icon, label, prob, temp } / null (if there is nothing to show yet).
const info = computed(() => {
    // Dev-forced rain
    if (ui.forceRain) {
        return {
            icon: 'bi-cloud-rain-heavy-fill',
            label: 'Heavy rain (dev)',
            prob: DEV_RAIN_CHANCE,
            temp: null          // no temperature in dev mode
        };
    };

    // Unloaded forecast, show nothing
    if (!ui.weather) return null;

    // Normal case, combine current conditions with this hour's rain chance
    const { label, icon } = describeCode(ui.weather.current.code);

    return {
        icon: icon,
        label: label,
        prob: currentHour.value?.prob ?? 0, // 0 if no matching hour
        temp: Math.round(ui.weather.current.temp) // e.g. 30.4 becomes 30
    };
});

// ---------------------------------------------------------------
// Should the chip use the dark "wet" style?
// ---------------------------------------------------------------

const wet = computed(() => {
    if (!info.value) return false
    return info.value.prob > WET_THRESHOLD
})

</script>

<template>
    <div v-if="info" class="wx" :class="{ wet }" :title="`${info.label}, ${info.prob}% rain chance this hour`">
        <!-- Weather icon -->
        <i class="bi" :class="info.icon"></i>

        <!-- Temperature (hidden when there is none, e.g. in dev mode) -->
        <span v-if="info.temp != null" class="mono">{{ info.temp }}°C</span>

        <!-- Chance of rain, with a droplet icon -->
        <span class="prob mono"><i class="bi bi-droplet-fill"></i>{{ info.prob }}%</span>

        <!-- Haze: PSI number, coloured by level -->
        <span v-if="haze" class="psi mono" :class="`psi-${haze.level}`"
              :title="`PSI ${haze.psi} (${haze.label})`">
            <i class="bi bi-wind"></i>{{ haze.psi }}
        </span>

        <!-- Lightning warning, only when a strike is within 15 km -->
        <i v-if="lightningNearby" class="bi bi-lightning-charge-fill bolt"
           :title="`Lightning ${ui.shownLightning.nearestKm} km away`"></i>
    </div>
</template>


<style scoped>
.wx {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 11px;
    border-radius: 999px;
    background: var(--zt-card);
    color: var(--zt-ink);
    border: var(--zt-bw) solid var(--zt-line);
    font-weight: 800;
    font-size: 0.8rem;
    box-shadow: var(--zt-shadow-sm);
}

.wx .bi:first-child {
    font-size: 1rem;
}

.wx.wet {
    background: #111;
    color: var(--zt-yellow);
    border-color: #111;
    box-shadow: 3px 3px 0 var(--zt-yellow);
}

[data-bs-theme='dark'] .wx.wet {
    border-color: var(--zt-yellow);
}

.prob {
    font-size: 0.74rem;
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.psi { font-size: 0.74rem; display: inline-flex; align-items: center; gap: 2px; }
.psi-good { color: #2e9e5b; }
.psi-moderate { color: #c9a400; }
.psi-unhealthy { color: #e07a1f; }
.psi-very-unhealthy, .psi-hazardous { color: #d6322e; }
.bolt { color: var(--zt-yellow); }
</style>
