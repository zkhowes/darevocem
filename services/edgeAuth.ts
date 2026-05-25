import { supabase } from './supabase';

declare const __DEV__: boolean;

/**
 * Thrown when an edge function call needs a signed-in user but no valid
 * session is available. Callers should surface a "please sign in again"
 * message rather than treating it as a generic failure.
 */
export class NotSignedInError extends Error {
  constructor() {
    super('Not signed in');
    this.name = 'NotSignedInError';
  }
}

/**
 * Resolve a valid user access token for an edge-function call.
 *
 * Our edge functions (`/identify`, `/transcribe`, `/speak`) verify the caller
 * with `supabase.auth.getUser(token)` — they reject anything that isn't a real
 * user JWT. We do NOT allow anonymous access.
 *
 * The previous pattern `session?.access_token ?? ANON_KEY` was a footgun: when
 * there was no session yet (cold start, mid token-refresh) it sent the anon
 * publishable key, which can NEVER pass getUser() — guaranteeing a confusing
 * 401 that surfaced as "couldn't read" / "camera unavailable" instead of an
 * honest "you're signed out".
 *
 * This helper returns the real access token, attempting one refresh if the
 * cached session looks absent, and throws NotSignedInError if there's truly no
 * session so callers can prompt re-auth.
 */
export async function getEdgeAuthToken(): Promise<string> {
  let session = (await supabase.auth.getSession()).data.session;

  // No cached session, or the access token is missing — try one refresh.
  // getSession() reads from storage and won't always proactively refresh an
  // expired token; refreshSession() forces it.
  if (!session?.access_token) {
    if (__DEV__) console.log('[edgeAuth] no cached session, attempting refresh');
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }

  if (!session?.access_token) {
    throw new NotSignedInError();
  }

  return session.access_token;
}
