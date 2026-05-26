import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Save a user-composed phrase to saved_phrases so it appears in the Saved list.
 *
 * Stored with category 'Personal' (the category the Saved screen shows) and no
 * label/value, so it renders as a plain phrase. It's placed AFTER the
 * profile-seeded items (which occupy sort_order 0-7) so identity facts stay at
 * the top of the Saved list — the new phrase goes to (current max + 1), falling
 * back to a high constant if the lookup fails.
 *
 * The supabase client is passed in (not imported) so this stays unit-testable.
 */
const FALLBACK_SORT_ORDER = 100;

export async function savePhrase(
  client: SupabaseClient,
  userId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  // Find the current highest sort_order for this user so the new phrase lands
  // at the end of the list rather than colliding with the profile items.
  let sortOrder = FALLBACK_SORT_ORDER;
  const { data: top, error: topError } = await client
    .from('saved_phrases')
    .select('sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!topError && top && typeof top.sort_order === 'number') {
    sortOrder = top.sort_order + 1;
  }

  const { error } = await client.from('saved_phrases').insert({
    user_id: userId,
    text: trimmed,
    category: 'Personal',
    sort_order: sortOrder,
  });
  if (error) throw error;
}
