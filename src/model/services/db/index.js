import { HAS_SUPABASE } from "../config.js";
import { localDb } from "./local.js";

/* Steven: index.js to merge logics between local and remote db */

let remoteDb = null;

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
    if (!remoteDb) {
        const {createRemoteDb} = await import('../../../lib/db/remote.js');
        remoteDb = createRemoteDb();
    }

    return remoteDb;
}