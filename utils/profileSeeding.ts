/**
 * Builds saved phrases and common items from profile data.
 * Shared between onboarding (initial seed) and profile editing (update).
 *
 * Saved phrases use variable format: "Label = Value"
 * When displayed, the label shows above the value.
 * When spoken (double-tap), only the value is spoken.
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
}

interface CommonItemRow {
  user_id: string;
  label: string;
  value: string;
  category: string;
  is_dynamic: boolean;
  sort_order: number;
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
 * - Personal phrases in "Label = Value" variable format
 * - Dynamic "Today" phrase
 * - Aphasia intro phrase
 * - Hospital check-in / self-advocacy phrases
 */
export function buildSavedPhrasesFromProfile(
  userId: string,
  data: ProfileData,
): SavedPhraseRow[] {
  const phrases: SavedPhraseRow[] = [];
  let personalOrder = 0;

  // Dynamic today phrase — resolved at display time, but seeded with current date
  phrases.push({
    user_id: userId,
    text: `Today = ${formatTodaySpoken()}`,
    category: 'Personal',
    sort_order: personalOrder++,
  });

  // Profile-sourced personal phrases (variable format)
  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
  if (fullName) {
    phrases.push({
      user_id: userId,
      text: `Name = ${fullName}`,
      category: 'Personal',
      sort_order: personalOrder++,
    });
  }

  if (data.dateOfBirth) {
    phrases.push({
      user_id: userId,
      text: `Date of Birth = ${data.dateOfBirth}`,
      category: 'Personal',
      sort_order: personalOrder++,
    });
  }

  if (data.phone) {
    phrases.push({
      user_id: userId,
      text: `Phone = ${data.phone}`,
      category: 'Personal',
      sort_order: personalOrder++,
    });
  }

  if (data.homeAddress) {
    phrases.push({
      user_id: userId,
      text: `Address = ${data.homeAddress}`,
      category: 'Personal',
      sort_order: personalOrder++,
    });
  }

  if (data.emergencyContact) {
    phrases.push({
      user_id: userId,
      text: `Emergency Contact = ${data.emergencyContact}`,
      category: 'Personal',
      sort_order: personalOrder++,
    });
  }

  if (data.emergencyPhone) {
    phrases.push({
      user_id: userId,
      text: `Emergency Phone = ${data.emergencyPhone}`,
      category: 'Personal',
      sort_order: personalOrder++,
    });
  }

  // Aphasia self-introduction — always seeded
  const nameIntro = fullName ? `My name is ${fullName} and I` : 'I';
  phrases.push({
    user_id: userId,
    text: `${nameIntro} have Aphasia. I understand everything you say but have trouble finding words. Please be patient with me.`,
    category: 'Introductions',
    sort_order: 0,
  });

  // Hospital check-in and self-advocacy phrases
  const checkInPhrases = [
    'I have an appointment',
    'I am here for a follow-up',
    'I am here for lab work',
    'I am here for imaging',
    'I need someone to help me fill out forms',
    'I have a brain tumor and have trouble speaking',
    'I can understand you perfectly',
  ];
  checkInPhrases.forEach((text, i) => {
    phrases.push({
      user_id: userId,
      text,
      category: 'Medical',
      sort_order: 10 + i, // after the default medical phrases
    });
  });

  return phrases;
}

/** Build common items from profile data (for the Common screen) */
export function buildCommonItemsFromProfile(
  userId: string,
  data: ProfileData,
): CommonItemRow[] {
  const items: CommonItemRow[] = [];

  const fullName = [data.firstName, data.lastName].filter(Boolean).join(' ');
  if (fullName) {
    items.push({
      user_id: userId,
      label: 'My name',
      value: fullName,
      category: 'Names',
      is_dynamic: false,
      sort_order: 0,
    });
  }

  if (data.dateOfBirth) {
    items.push({
      user_id: userId,
      label: 'DOB',
      value: data.dateOfBirth,
      category: 'Dates',
      is_dynamic: false,
      sort_order: 0,
    });
  }

  if (data.phone) {
    items.push({
      user_id: userId,
      label: 'My phone',
      value: data.phone,
      category: 'Names',
      is_dynamic: false,
      sort_order: 1,
    });
  }

  if (data.homeAddress) {
    items.push({
      user_id: userId,
      label: 'My address',
      value: data.homeAddress,
      category: 'Places',
      is_dynamic: false,
      sort_order: 0,
    });
  }

  if (data.emergencyContact) {
    items.push({
      user_id: userId,
      label: 'Emergency contact',
      value: data.emergencyContact,
      category: 'Names',
      is_dynamic: false,
      sort_order: 2,
    });
  }

  if (data.emergencyPhone) {
    items.push({
      user_id: userId,
      label: 'Emergency phone',
      value: data.emergencyPhone,
      category: 'Names',
      is_dynamic: false,
      sort_order: 3,
    });
  }

  return items;
}

/**
 * Labels for profile-sourced saved phrases.
 * Used by the profile editor to find and update existing phrases.
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
