import { CITY } from './config.js';

/*
    Opening-hours helpers.

    A place's opening hours are in SGT and look like this:
        - hours: "24h" or [["07:00","12:00"],["18:00","21:00"]]
        - closed_days: Optional list of weekday numbers (0 = Sunday, ..., 6 = Saturday)
*/

const MS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const END_OF_DAY = '23:59'; // Closing time of "23:59" means open until the end of the day (24:00)

// Shifts a timestamp by SGT's offset
// E.g. 16:00 UTC -> 00:00 SGT (next day)
function toSgDate(ms) {
    return new Date(ms + CITY.utcOffsetMin * MS_PER_MINUTE);
}

// Converts "HH:MM" format into minutes since midnight (00:00)
// E.g. "07:30" -> 7 * 60 + 30 = 450
function timeToMinutes(hhmm) {
    const [hours, minutes] = hhmm.split(':').map(Number);
    return hours * 60 + minutes;
}

// Zero padding
// E.g. 5 -> "05"
function zeroPad(number) {
    return String(number).padStart(2, '0');
}

// Returns true when the place has no opening hours/is marked "24h"
function isAlwaysOpen(place) {
    return !place.hours || place.hours === '24h';
}

// Returns true when the weekday of the given time is in the place's closed_days
function isClosedDay(place, ms) {
    const weekday = getSgTimeParts(ms).day;
    return Array.isArray(place.closed_days) && place.closed_days.includes(weekday);
}

// Returns closing time in minutes since midnight (00:00)
function getCloseMinutes(openText, closeText) {
    const open = timeToMinutes(openText);
    let close = closeText === END_OF_DAY ? MINUTES_PER_DAY : timeToMinutes(closeText);

    if (close <= open) close += MINUTES_PER_DAY; // E.g. a place open from 10PM to 2AM
    return close;
}

// Breaks a timestamp into SGT minutes since midnight and weekday
export function getSgTimeParts(ms) {
    const sg = toSgDate(ms);
    const hours = sg.getUTCHours();
    return {
        minutes: hours * 60 + sg.getUTCMinutes(),
        day: sg.getUTCDay()
    };
}

// Returns true if the place is open for the whole visit (arrival until departure)
// Note: closed_days is only checked for the day of ARRIVAL, and a range that
//       runs past midnight (e.g. 22:00-02:00) only matches arrivals on the opening
//       side (e.g. 23:00, not 01:00).
export function isOpenDuringVisit(place, arriveMs, departMs) {
    if (isClosedDay(place, arriveMs)) return false;
    if (isAlwaysOpen(place)) return true;

    const arrive = getSgTimeParts(arriveMs).minutes;
    const visitLength = Math.round((departMs - arriveMs) / MS_PER_MINUTE);
    const leave = arrive + visitLength;

    return place.hours.some(([openText, closeText]) => {
        const open = timeToMinutes(openText);
        const close = getCloseMinutes(openText, closeText);
        return arrive >= open && leave <= close;
    });
}

// Text for display, e.g. "07:00-12:00, 18:00-21:00 · Closed Mon"
export function formatOpeningHours(place) {
    if (isAlwaysOpen(place)) return 'Open 24 hours';

    const ranges = place.hours
    .map(([open, close]) => `${open}-${close === END_OF_DAY ? '24:00' : close}`)
    .join(', ');

    const hasClosedDays = place.closed_days?.length > 0;
    const closed = hasClosedDays
    ? ` · Closed ${place.closed_days.map((day) => DAY_NAMES[day]).join(', ')}`
    : '';

    return ranges + closed;
}

// Converts timestamp (ms) or ISO string into "HH:MM" in SGT
export function formatTime(msOrIso) {
    const ms = typeof msOrIso === 'string' ? Date.parse(msOrIso) : msOrIso;
    const { minutes } = getSgTimeParts(ms);
    return `${zeroPad(Math.floor(minutes / 60))}:${zeroPad(minutes % 60)}`;
}

// Converts minutes into "xx min", "xx h" or "xx h xx min"
// E.g. "45 min", "2 h", "1 h 20 min"
export function formatDuration(min) {
    const total = Math.max(0, Math.round(min));
    if (total < 60) return `${total} min`;

    const hours = Math.floor(total / 60);
    const leftover = total % 60;
    return leftover ? `${hours} h ${leftover} min` : `${hours} h`;
}

// Converts timestamp into "YYYY-MM-DDTHH:mm" in SGT
// E.g. "2026-10-19T00:56"
export function toSgLocalInput(ms) {
    return toSgDate(ms).toISOString().slice(0, 16);
}

// Converts "YYYY-MM-DDTHH:mm" in SGT into timestamp
export function fromSgLocalInput(value) {
    const asIfUtc = Date.parse(value + ':00Z');
    return asIfUtc - CITY.utcOffsetMin * MS_PER_MINUTE;
}