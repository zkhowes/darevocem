// Rotating home-screen tips. One is shown per app load (rotated by a counter
// in AsyncStorage). The user has aphasia and finds reading hard, so every tip
// can be read aloud with the system voice via the speak icon on the card.
//
// Categories: how-to (using the app), encouragement (warm support), and
// feature spotlights (lesser-known capabilities). The user's aphasia
// introduction phrase is injected separately at runtime (it's built from their
// profile name and isn't a static string), so it lives in the home screen, not
// here.

export interface Tip {
  /** Short heading shown above the body. */
  title: string;
  /** The body text — also what the speak icon reads aloud. */
  body: string;
}

export const HOME_TIPS: Tip[] = [
  // --- How-to ---
  { title: 'Speak a word', body: 'Tap the microphone, then say a word. I will help you build the rest of the sentence.' },
  { title: 'See more words', body: 'Swipe up and down on the word list to move through your choices.' },
  { title: 'Add a word', body: 'Double-tap a word to add it to your sentence.' },
  { title: 'Say it out loud', body: 'When your sentence is ready, double-tap the sentence bar to speak it aloud.' },
  { title: 'Go back a step', body: 'Swipe right on a word to go back. Nothing is ever locked in.' },

  // --- Feature spotlights ---
  { title: 'Name what you see', body: 'Tap the camera to point at something, and I will name it for your sentence.' },
  { title: 'Write by hand', body: 'Tap the pencil to write a word with your finger when it is easier than talking.' },
  { title: 'Your saved phrases', body: 'The things you say most are saved and just one tap away.' },

  // --- Encouragement ---
  { title: 'Take your time', body: 'There is no rush. I will wait with you for as long as you need.' },
  { title: 'You are doing great', body: 'Every word you find is a win. I am here to help you find the next one.' },
];
