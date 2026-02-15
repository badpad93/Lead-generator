import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Server-side admin client – uses service role key. Never expose to browser. */
export const supabaseAdmin = createClient(url, serviceKey);

/** Client-safe Supabase instance (anon key only). */
export const supabaseClient = createClient(url, anonKey);
