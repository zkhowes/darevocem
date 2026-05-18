/**
 * Pure helpers for merging predictions on the compose and home screens.
 * Extracted from app/(app)/compose.tsx and app/(app)/index.tsx so the
 * splice / dedupe logic is testable with Jest.
 *
 * Concepts:
 *   - splicePredictionAtP1 — compose: inject a contextual common-phrase
 *     suggestion right after the literal P0 captured by mic/keyboard/etc.
 *     Does NOT touch P0. Bumps ranks of items at index >= 1.
 *   - mergeCommonPhrase — home: prepend a contextual common-phrase to the
 *     time-of-day common list. Dedupes by lowercased text, caps the list.
 *
 * Both helpers operate on ComposeItem arrays. They DON'\''T mutate inputs.
 */

import type { ComposeItem } from '../types';

/**
 * Splice a contextual suggestion at index 1 of the predictions list. The
 * incoming item is forced to itemType: 'common' and rank: 1 (the existing
 * 'common' style provides the visual differentiation). Existing items at
 * index >= 1 have their ranks bumped by one.
 *
 * Returns the original array unchanged if:
 *   - predictions is empty (nothing to splice after)
 *   - an item with the same lowercased text already exists anywhere in
 *     the list (dedupe)
 */
export function splicePredictionAtP1(
  predictions: ComposeItem[],
  item: ComposeItem,
): ComposeItem[] {
  if (predictions.length === 0) return predictions;
  const lower = item.text.toLowerCase();
  if (predictions.some((p) => p.text.toLowerCase() === lower)) return predictions;

  const tagged: ComposeItem = { ...item, itemType: 'common', rank: 1 };
  return [
    predictions[0],
    tagged,
    ...predictions.slice(1).map((p, i) => ({ ...p, rank: i + 2 })),
  ];
}

/**
 * Prepend a contextual common-phrase suggestion onto the home Common section.
 * Dedupes by lowercased text. Caps the resulting list at maxLength to keep
 * the home Common section from growing without bound.
 */
export function mergeCommonPhrase(
  current: ComposeItem[],
  item: ComposeItem,
  maxLength: number = 4,
): ComposeItem[] {
  const existing = new Set(current.map((c) => c.text.toLowerCase()));
  if (existing.has(item.text.toLowerCase())) return current;
  return [item, ...current].slice(0, maxLength);
}
