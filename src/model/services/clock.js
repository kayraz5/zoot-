import { ref } from 'vue';

/*
    App clock.

    Everything time-sensitive (HUD, planner, replans) should call now() instead of
    Date.now(), so the /dev panel can "skip wait" by shifting the clock forward.
*/

const MS_PER_MINUTE = 60 * 1000;
const STORAGE_KEY = 'zoot.clockOffset';
const offsetMs = ref(loadOffset()); // How far the app clock is ahead of the real clock (in ms)
export const tick = ref(Date.now()); // Changes every second, so components that read it update automatically

// Reads the saved offset (in ms) when the app starts, or 0 if there isn't a valid one
function loadOffset() {
    try {
        const saved = Number(localStorage.getItem(STORAGE_KEY) || 0);
        return Number.isFinite(saved) ? saved : 0; // Ignore corrupted values
    } 
    catch(error) {
        return 0; // localStorage unavailable
    }
}

// Saves the offset so it survives a page refresh
function saveOffset(ms) {
    try {
        localStorage.setItem(STORAGE_KEY, String(ms));
    } 
    catch(error) {
        // Ignore: the offset just won't survive a page refresh
    }
}

// Deletes the saved offset
function clearSavedOffset() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } 
    catch(error) {
        // Ignore: nothing to clear
    }
}

// The app's current time (ms): real time + skipped time
// Using this instead of Date.now()
export function now() {
    return Date.now() + offsetMs.value;
}

// How many minutes the app clock is ahead of real time
export function clockOffsetMin() {
    return Math.round(offsetMs.value / MS_PER_MINUTE);
}

// Moves the app clock forward by the given number of minutes
export function skipMinutes(min) {
    offsetMs.value += min * MS_PER_MINUTE;
    saveOffset(offsetMs.value);
    tick.value = now();
}

// Puts the app clock back in sync with real time
export function resetClock() {
    offsetMs.value = 0;
    clearSavedOffset();
    tick.value = now();
}

// Updates tick every second so components can show live countdowns
setInterval(() => { tick.value = now() }, 1000);