/**
 * Builds saved phrases from profile data.
 * Shared between onboarding (initial seed) and profile editing (update).
 *
 * Variable phrases use label + value columns:
 * - Display shows label above value (e.g. "Name" above the user's first name)
 * - Auditory preview reads the label only ("Name")
 * - Selection inserts the value only (the user's first name)
 * - text column stores the value for backward compat / full-text search
 *
 * Non-variable phrases use text only (label and value stay NULL).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfileData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  homeAddress: string;
  emergencyContact: string;
  emergencyPhone: string;
}

// Fixed sort_order per profile-seeded phrase. The home screen shows the first
// three Personal phrases by sort_order, so Name / DOB / Today lead — the three
// identity facts the user most needs at hand. The rest follow.
const SORT_ORDER = {
  name: 0,
  dateOfBirth: 1,
  today: 2,
  phone: 3,
  address: 4,
  emergencyContact: 5,
  emergencyPhone: 6,
  intro: 7,
} as const;

interface SavedPhraseRow {
  user_id: string;
  text: string;
  category: string;
  sort_order: number;
  label?: string;
  value?: string;
}

/** Format today's date as spoken text, e.g. "March 27 2026" */
export function formatTodaySpoken(): string {
  const now = new Date();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`;
}

/**
 * Build saved phrases from profile data.
 * Only seeds:
 * - Profile-sourced variables (Name, DOB, Phone, Address, Emergency Contact/Phone, Today)
 * - One aphasia intro phrase
 */
export function buildSavedPhrasesFromProfile(
  userId: string,
  data: ProfileData,
): SavedPhraseRow[] {
  const phrases: SavedPhraseRow[] = [];

  // Profile-sourced variable phrases. Each carries a fixed sort_order so the
  // home screen's top three are deterministic (Name, DOB, Today).
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
  if (fullName) {
    phrases.push({
      user_id: userId,
      text: fullName,
      label: 'Name',
      value: fullName,
      category: 'Personal',
      sort_order: SORT_ORDER.name,
    });
  }

  if (data.dateOfBirth) {
    phrases.push({
      user_id: userId,
      text: data.dateOfBirth,
      label: 'Date of Birth',
      value: data.dateOfBirth,
      category: 'Personal',
      sort_order: SORT_ORDER.dateOfBirth,
    });
  }

  // Dynamic today phrase — resolved at display time
  const todayValue = formatTodaySpoken();
  phrases.push({
    user_id: userId,
    text: todayValue,
    label: 'Today',
    value: todayValue,
    category: 'Personal',
    sort_order: SORT_ORDER.today,
  });

  if (data.phone) {
    phrases.push({
      user_id: userId,
      text: data.phone,
      label: 'Phone',
      value: data.phone,
      category: 'Personal',
      sort_order: SORT_ORDER.phone,
    });
  }

  if (data.homeAddress) {
    phrases.push({
      user_id: userId,
      text: data.homeAddress,
      label: 'Address',
      value: data.homeAddress,
      category: 'Personal',
      sort_order: SORT_ORDER.address,
    });
  }

  if (data.emergencyContact) {
    phrases.push({
      user_id: userId,
      text: data.emergencyContact,
      label: 'Emergency Contact',
      value: data.emergencyContact,
      category: 'Personal',
      sort_order: SORT_ORDER.emergencyContact,
    });
  }

  if (data.emergencyPhone) {
    phrases.push({
      user_id: userId,
      text: data.emergencyPhone,
      label: 'Emergency Phone',
      value: data.emergencyPhone,
      category: 'Personal',
      sort_order: SORT_ORDER.emergencyPhone,
    });
  }

  // Aphasia intro — a full phrase, not a variable. It still carries the 'Intro'
  // label (matched in PROFILE_PHRASE_LABELS) so the idempotent reseed can delete
  // it without touching user-saved custom phrases (which have no profile label).
  const nameIntro = fullName ? `My name is ${fullName} and I` : 'I';
  phrases.push({
    user_id: userId,
    text: `${nameIntro} have Aphasia. I understand everything but have trouble finding words. Please be patient with me.`,
    label: 'Intro',
    category: 'Personal',
    sort_order: SORT_ORDER.intro,
  });

  return phrases;
}

/**
 * Labels for profile-sourced saved phrases.
 * Used by the profile editor to find and delete existing variable phrases.
 */
export const PROFILE_PHRASE_LABELS = [
  'Name',
  'Date of Birth',
  'Phone',
  'Address',
  'Emergency Contact',
  'Emergency Phone',
  'Today',
  'Intro',
] as const;

/**
 * Reseed the user's profile-derived saved phrases idempotently.
 * Shared by onboarding (first run) and the profile editor (updates).
 *
 * Deletes ONLY the profile-seeded rows (matched by PROFILE_PHRASE_LABELS) and
 * reinserts them from current profile data. This is deliberately label-scoped
 * rather than a full per-user wipe so user-saved custom phrases — which have no
 * profile label — survive a profile edit.
 *
 * The supabase client is passed in (not imported) so this stays unit-testable
 * with a mock.
 */
export async function seedProfilePhrases(
  client: SupabaseClient,
  userId: string,
  data: ProfileData,
): Promise<void> {
  // Remove existing profile-seeded rows for this user.
  const { error: delError } = await client
    .from('saved_phrases')
    .delete()
    .eq('user_id', userId)
    .in('label', PROFILE_PHRASE_LABELS as unknown as string[]);
  if (delError) throw delError;

  const rows = buildSavedPhrasesFromProfile(userId, data);
  if (rows.length === 0) return;

  const { error: insertError } = await client.from('saved_phrases').insert(rows);
  if (insertError) throw insertError;
}
