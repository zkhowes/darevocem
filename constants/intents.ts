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

/**
 * Expanded, hand-curated sentence-starters for the Predicted "See all" screen.
 * The first page of that screen is the 10 INTENTS above (instant, offline). As
 * the user scrolls, these append, and beyond them the screen requests fresh
 * AI-generated starters. This list is also the offline fallback when the AI
 * request fails — so it must never be empty and should read naturally for
 * someone with aphasia completing a thought.
 */
export const INTENT_STARTERS: string[] = [
  'I would like',
  'Can you',
  'Could you',
  'I am trying to',
  'I have to',
  'I want to',
  'I need to',
  'How do I',
  'Where is the',
  'When is',
  'What time is',
  'Why is',
  'Who is',
  'I am looking for',
  'Please help me',
  'Please bring me',
  'Please tell',
  'I would like to',
  'Let us',
  'Do you know',
  'Do you have',
  'Can I have',
  'May I have',
  'I think',
  'I remember',
  'I forgot',
  'I am feeling',
  'I am not',
  'I do not want',
  'I do not feel',
  'It hurts',
  'I am tired',
  'I am hungry',
  'I am thirsty',
  'I am cold',
  'I am hot',
  'I love you',
  'Thank you for',
  'I am sorry',
  'Tell me about',
  'Show me',
  'Take me to',
  'Help me with',
  'I want to go',
  'I want to see',
  'Call',
  'Ask',
  'Remind me to',
  'I have a question about',
  'Something is wrong with',
];
