import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

export function createRemoteDb() {
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        }
    }) 

    const must = ({ data, err }) => {
        if (err) {
            throw new Error(err.message);
        }
        return data;
    }

    return {
        kind: 'supabase',
        client: db,

        // TO DO: implement functions the same as local.js
    };
}