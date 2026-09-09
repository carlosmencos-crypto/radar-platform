import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "https://xxobbhnhxhcjkdxmjmwj.supabase.co";
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || "sb_publishable_dtvSaFdTJeZ1LAslek8Yjg_PVKGtDZn";

export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl!, publishableKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
