import type { IntentDefinition } from '../types';

export const INTENTS: IntentDefinition[] = [
  { text: 'I need', addsToPhrase: true },
  { text: 'I want', addsToPhrase: true },
  { text: 'I feel', addsToPhrase: true },
  { text: 'Please', addsToPhrase: true },
  { text: 'Where is', addsToPhrase: true },
  { text: "Don't", addsToPhrase: true },
  { text: 'I love', addsToPhrase: true },
  { text: 'Thank you', addsToPhrase: true },
  { text: 'Help', addsToPhrase: true },
  { text: 'Question', addsToPhrase: false },
];

export const DEFAULT_INTENT_BY_TIME: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 5,
  night: 0,
};
