import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
}) : null;

function wrapUser(user, session) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    displayName: user.user_metadata?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Learner",
    async getIdToken() {
      return session?.access_token || "";
    },
  };
}

export async function initializeSupabaseClient() {
  return null;
}

export function watchAuthState(callback) {
  if (!supabase) {
    callback(null);
    return () => {};
  }

  supabase.auth.getSession().then(({ data }) => {
    callback(wrapUser(data.session?.user || null, data.session || null));
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(wrapUser(session?.user || null, session || null));
  });

  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email, password) {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return data;
}

export async function registerWithEmail(email, password, displayName) {
  if (!supabase) {
    return null;
  }

  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        display_name: displayName || email.split("@")[0],
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOutUser() {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}
