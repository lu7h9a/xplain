import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

let supabaseAdmin = null;

export function getSupabaseAdmin() {
  if (supabaseAdmin !== null) {
    return supabaseAdmin;
  }

  const key = supabaseServiceRoleKey || supabaseAnonKey;
  if (!supabaseUrl || !key) {
    supabaseAdmin = null;
    return null;
  }

  supabaseAdmin = createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseAdmin;
}

export async function verifyAuthToken(idToken) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !idToken) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getUser(idToken);
    if (error) {
      console.error("Supabase token verification failed:", error.message);
      return null;
    }

    const user = data.user;
    if (!user) {
      return null;
    }

    return {
      uid: user.id,
      email: user.email || null,
      name: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || null,
      user_metadata: user.user_metadata || {},
    };
  } catch (error) {
    console.error("Supabase token verification failed:", error.message);
    return null;
  }
}

