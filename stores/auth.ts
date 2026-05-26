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
    firstName: (row.first_name as string) ?? null,
    lastName: (row.last_name as string) ?? null,
    dateOfBirth: (row.date_of_birth as string) ?? null,
    phone: (row.phone as string) ?? null,
    homeAddress: (row.home_address as string) ?? null,
    emergencyContact: (row.emergency_contact as string) ?? null,
    emergencyPhone: (row.emergency_phone as string) ?? null,
    onboardingComplete: (row.onboarding_complete as boolean) ?? false,
  };
}

/**
 * Sentinel returned by fetchProfile when the fetch itself FAILED (network /
 * timeout), as opposed to the row genuinely not existing (which returns null).
 * Callers must NOT overwrite an existing profile on 'error' — a transient
 * cold-start failure must never clobber a good profile and bounce a completed
 * user back to onboarding.
 */
type FetchProfileResult = UserProfile | null | 'error';

// PostgREST code for ".single() matched zero rows" — i.e. the row is genuinely
// absent (new user, no profile yet), not a transient failure.
const PGRST_NO_ROWS = 'PGRST116';

/**
 * Fetch profile from Supabase.
 * - Returns the profile when the row exists.
 * - Returns null when the row is genuinely absent (new user → onboarding).
 * - Returns 'error' on a transient fetch failure; retries once first.
 */
async function fetchProfile(userId: string): Promise<FetchProfileResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (data) return mapProfile(data);
      // Row genuinely absent — not a failure, so don't retry.
      if (error && (error as { code?: string }).code === PGRST_NO_ROWS) return null;
      if (!error) return null;
      // Any other error is treated as transient: fall through to retry/'error'.
    } catch {
      // Network/unexpected — fall through to retry/'error'.
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
  }
  return 'error';
}

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  // True once a profile fetch has completed for the current session (whether
  // it returned a row or null). The router waits for this before deciding
  // whether to send the user to onboarding, so a blank profile doesn't flash
  // the onboarding screen during the async fetch after a fresh login.
  profileLoaded: boolean;
  _subscription: Subscription | null;
  initialize: () => Promise<void>;
  cleanup: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  isLoading: true,
  profileLoaded: false,
  _subscription: null,

  initialize: async () => {
    // Clean up any existing subscription (e.g. hot reload)
    get()._subscription?.unsubscribe();

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const result = await fetchProfile(session.user.id);
      if (result === 'error') {
        // Fetch failed — keep whatever profile we already have (likely none on
        // first init). Only mark loaded if we have a profile, otherwise leave
        // it false so the router waits rather than routing to onboarding.
        const existing = get().profile;
        set({ session, isLoading: false, profileLoaded: existing != null });
      } else {
        set({ session, profile: result, isLoading: false, profileLoaded: true });
      }
    } else {
      set({ session: null, profile: null, isLoading: false, profileLoaded: false });
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          // Set session immediately so navigation unblocks, then fetch profile.
          // Preserve any already-loaded profile so a TOKEN_REFRESHED on cold
          // start doesn't transiently blank it (and bounce to onboarding).
          const hadProfile = get().profile != null;
          set({ session, isLoading: false, profileLoaded: hadProfile });
          const result = await fetchProfile(session.user.id);
          if (result === 'error') {
            // Failed refetch: never clobber a good profile.
            set({ profileLoaded: hadProfile });
          } else {
            set({ profile: result, profileLoaded: true });
          }
        } else {
          set({ session: null, profile: null, isLoading: false, profileLoaded: false });
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
      throw sessionError;
    }
  },

  signInWithApple: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data.url) throw new Error('No OAuth URL returned');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !('url' in result)) return;

    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (!code) {
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
      return;
    }

    await supabase.auth.exchangeCodeForSession(code);
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    // Clear local state regardless — session is no longer usable
    set({ session: null, profile: null });
    if (error) throw error;
  },
}));
