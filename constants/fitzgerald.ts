// Modified Fitzgerald Key — the universal AAC color coding system.
// Colors help users scan by category without needing to read every label.
// Consistency is critical: the same word type is ALWAYS the same color.

import type { WordType } from '../types';

// Fitzgerald Key colors — one per word category.
// Used as accent colors (border tints, subtle backgrounds at 15% opacity).
export const FITZGERALD_COLORS: Record<WordType, string> = {
  verb:       '#27AE60', // green
  noun:       '#E07B2E', // orange (matches existing prediction color)
  descriptor: '#3498DB', // blue
  person:     '#F1C40F', // yellow
  question:   '#9B59B6', // purple
  negation:   '#C0392B', // red
  social:     '#E91E8C', // pink
  misc:       '#999999', // grey
};

// Map each curated intent to a Fitzgerald category.
// This determines the color tint on the IntentSection header.
export const INTENT_CATEGORY: Record<string, WordType> = {
  'I need':    'verb',
  'I want':    'verb',
  'I feel':    'descriptor',
  'Please':    'social',
  'Where is':  'question',
  "Don't":     'negation',
  'I love':    'person',
  'Thank you': 'social',
  'Help':      'negation',
  'Question':  'question',
};

// Returns the Fitzgerald color for an intent string.
// Matches on prefix so "I need to" still resolves to "I need".
export function getIntentColor(intentText: string): string {
  // Exact match first
  if (INTENT_CATEGORY[intentText]) {
    return FITZGERALD_COLORS[INTENT_CATEGORY[intentText]];
  }
  // Prefix match for modified intents ("I need to" -> "I need")
  const match = Object.keys(INTENT_CATEGORY).find(
    (key) => intentText.toLowerCase().startsWith(key.toLowerCase()),
  );
  if (match) {
    return FITZGERALD_COLORS[INTENT_CATEGORY[match]];
  }
  // Default to verb (green) for unknown intents
  return FITZGERALD_COLORS.verb;
}

// Returns the Fitzgerald category for an intent string.
export function getIntentCategory(intentText: string): WordType {
  if (INTENT_CATEGORY[intentText]) {
    return INTENT_CATEGORY[intentText];
  }
  const match = Object.keys(INTENT_CATEGORY).find(
    (key) => intentText.toLowerCase().startsWith(key.toLowerCase()),
  );
  return match ? INTENT_CATEGORY[match] : 'verb';
}

// Returns the Fitzgerald color for a word type.
export function getWordTypeColor(wordType: WordType | undefined): string {
  return FITZGERALD_COLORS[wordType ?? 'misc'];
}
