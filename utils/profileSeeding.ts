/**
 * Builds saved phrases from profile data.
 * Shared between onboarding (initial seed) and profile editing (update).
 *
 * Variable phrases use label + value columns:
 * - Display shows label above value (e.g. "Name" above "Amanda")
 * - Auditory preview reads the label only ("Name")
 * - Selection inserts the value only ("Amanda")
 * - text column stores the value for backward compat / full-text search
 *
 * Non-variable phrases use text only (label and value stay NULL).
 */

export interface ProfileData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string;
  homeAddress: string;
  emergencyContact: string;
  emergencyPhone: string;
}

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
  let order = 0;

  // Dynamic today phrase — resolved at display time
  const todayValue = formatTodaySpoken();
  phrases.push({
    user_id: userId,
    text: todayValue,
    label: 'Today',
    value: todayValue,
    category: 'Personal',
    sort_order: order++,
  });

  // Profile-sourced variable phrases
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
  if (fullName) {
    phrases.push({
      user_id: userId,
      text: fullName,
      label: 'Name',
      value: fullName,
      category: 'Personal',
      sort_order: order++,
    });
  }

  if (data.dateOfBirth) {
    phrases.push({
      user_id: userId,
      text: data.dateOfBirth,
      label: 'Date of Birth',
      value: data.dateOfBirth,
      category: 'Personal',
      sort_order: order++,
    });
  }

  if (data.phone) {
    phrases.push({
      user_id: userId,
      text: data.phone,
      label: 'Phone',
      value: data.phone,
      category: 'Personal',
      sort_order: order++,
    });
  }

  if (data.homeAddress) {
    phrases.push({
      user_id: userId,
      text: data.homeAddress,
      label: 'Address',
      value: data.homeAddress,
      category: 'Personal',
      sort_order: order++,
    });
  }

  if (data.emergencyContact) {
    phrases.push({
      user_id: userId,
      text: data.emergencyContact,
      label: 'Emergency Contact',
      value: data.emergencyContact,
      category: 'Personal',
      sort_order: order++,
    });
  }

  if (data.emergencyPhone) {
    phrases.push({
      user_id: userId,
      text: data.emergencyPhone,
      label: 'Emergency Phone',
      value: data.emergencyPhone,
      category: 'Personal',
      sort_order: order++,
    });
  }

  // Aphasia intro — a full phrase, not a variable
  const nameIntro = fullName ? `My name is ${fullName} and I` : 'I';
  phrases.push({
    user_id: userId,
    text: `${nameIntro} have Aphasia. I understand everything but have trouble finding words. Please be patient with me.`,
    category: 'Personal',
    sort_order: order++,
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
] as const;
