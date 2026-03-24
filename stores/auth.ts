import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { Session, Subscription } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

/** Map snake_case DB row to camelCase UserProfile */
function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    role: row.role as UserProfile['role'],
    displayName: (row.display_name as string) ?? null,
  };
}

/** Fetch profile from Supabase, returning null on error */
async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return mapProfile(data);
}

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  _subscription: Subscription | null;
  initialize: () => Promise<void>;
  cleanup: () => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  _subscription: null,

  initialize: async () => {
    // Clean up any existing subscription (e.g. hot reload)
    get()._subscription?.unsubscribe();

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const profile = await fetchProfile(session.user.id);
      set({ session, profile, isLoading: false });
    } else {
      set({ session: null, profile: null, isLoading: false });
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          const profile = await fetchProfile(session.user.id);
          set({ session, profile });
        } else {
          set({ session: null, profile: null });
        }
      },
    );
    set({ _subscription: subscription });
  },

  cleanup: () => {
    get()._subscription?.unsubscribe();
    set({ _subscription: null });
  },

  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) throw error;
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    // Clear local state regardless — session is no longer usable
    set({ session: null, profile: null });
    if (error) throw error;
  },
}));
