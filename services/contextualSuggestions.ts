import { getSuggestedPhrase } from './predictions';
import { getTimeOfDay } from './context';
import { useCompositionStore } from '../stores/composition';
import type { ComposeItem } from '../types';

declare const __DEV__: boolean;

// Fire-and-forget hook called after every input modality (mic / keyboard /
// handwriting) accepts a word or phrase. The captured word is already P0 by
// the time we fire; this fetches ONE contextual common phrase that incorporates
// it and hands it back to the caller via an `onSuggest` callback.
//
// Why a callback instead of writing to the store directly: home commonPhrases
// live in local component state in app/(app)/index.tsx, while compose P1
// lives in the prediction list via an inline helper. Each screen knows where
// the suggestion should land — we just hand it the item.
//
// Camera flow is INTENTIONALLY excluded as a call site: /identify already
// produces both a literal AND a contextual interpretation. Firing
// fireContextualSuggestion after camera would produce a redundant third
// interpretation. Callers MUST NOT invoke this from the camera accept path.

export type SuggestionCallback = (item: ComposeItem) => void;

// Home flow: only time-of-day context.
export function fireContextualSuggestionForHome(
  captured: string,
  onSuggest: SuggestionCallback,
): void {
  if (!captured || captured.trim().length === 0) return;

  getSuggestedPhrase(captured, { timeOfDay: getTimeOfDay() }).then((item) => {
    if (!item) return;
    if (__DEV__) console.log(`[suggest_phrase] home "${captured}" -> "${item.text}"`);
    onSuggest(item);
  });
}

// Compose flow: intent + partial-phrase context. Reads store state lazily inside
// .then so the suggestion merges into whatever the store looks like by response
// time, not whatever it was at fire time (survives the user advancing/refining
// mid-flight).
export function fireContextualSuggestionForCompose(
  captured: string,
  onSuggest: SuggestionCallback,
): void {
  if (!captured || captured.trim().length === 0) return;

  const { intent, getPhrase } = useCompositionStore.getState();
  const fullPhrase = getPhrase() || captured;

  getSuggestedPhrase(captured, { intent, fullPhrase }).then((item) => {
    if (!item) return;
    if (__DEV__) console.log(`[suggest_phrase] compose "${captured}" -> "${item.text}"`);
    onSuggest(item);
  });
}
