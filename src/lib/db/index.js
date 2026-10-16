import { HAS_SUPABASE } from "../config.js";
import { localDb } from "./local.js";

let remote = null;

export function isGuestMode() {
    try  {
        return !HAS_SUPABASE || localStorage.getItem('zoot.guest') === '1'
    } catch (err) {
        console.error(err);
        return true;
    }
}

export function setGuestMode(on) {
    try {
        on ? localStorage.setItem('zoot.guest', '1') : localStorage.removeItem('zoot.guest');
    } catch (err) {
        console.error(err);
    }
}

export async function getDb() {
    if (isGuestMode()) {
        return localDb
    }
    if (!remote) {
        const {createRemoteDb} = await import('./remote.js');
        remote = createRemoteDb();
    }

    return remote;
}