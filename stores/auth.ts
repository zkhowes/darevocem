import { create } from 'zustand';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../services/supabase';
import type { Session, Subscription } from '@supabase/supabase-js';
import type { UserProfile } from '../types';

const redirectTo = makeRedirectUri({ scheme: 'darevocem', path: 'auth/callback' });

/** Map snake_case DB row to camelCase UserProfile */
function mapProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: row.id as string,
    role: row.role as UserProfile['role'],
    displayName: (row.display_name as string) ?? null,
  };
}

/** Fetch profile from Supabase, returning null on error or missing table */
async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error || !data) return null;
    return mapProfile(data);
  } catch {
    return null;
  }
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
          // Set session immediately so navigation unblocks, then fetch profile
          set({ session, isLoading: false });
          const profile = await fetchProfile(session.user.id);
          set({ profile });
        } else {
          set({ session: null, profile: null, isLoading: false });
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
    // Use PKCE flow — Supabase redirects back with a code, not tokens in the fragment
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data.url) throw new Error('No OAuth URL returned');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !('url' in result)) return;

    // Extract the auth code from the redirect URL
    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (!code) {
      // Try fragment params (implicit flow fallback)
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
      return;
    }

    // Exchange code for session
    const { data: sessionData, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
    if (sessionError) {
      Alert.alert('Code exchange error', sessionError.message);
      throw sessionError;
    }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    // Clear local state regardless — session is no longer usable
    set({ session: null, profile: null });
    if (error) throw error;
  },
}));
