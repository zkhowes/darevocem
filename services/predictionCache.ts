import type { ComposeItem, TimeOfDay } from '../types';
import { getPredictions } from './predictions';

declare const __DEV__: boolean;

// 60s — long enough to cover focus → tap → compose-mount, short enough that
// time-of-day-sensitive predictions don't get served stale.
const TTL_MS = 60_000;

interface CacheEntry {
  predictions: ComposeItem[];
  expiresAt: number;
  source: 'cache';
}

interface InflightEntry {
  promise: Promise<ComposeItem[]>;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, InflightEntry>();

function keyFor(fullPhrase: string, triedItems?: string[]): string {
  const tried = (triedItems ?? []).join('|');
  return `${fullPhrase.toLowerCase().trim()}::${tried}`;
}

// Synchronous lookup — returns cached predictions if fresh, otherwise null.
// Use this at handler-call time to decide whether to await fresh fetch.
export function getCachedPredictions(
  fullPhrase: string,
  triedItems?: string[],
): ComposeItem[] | null {
  const key = keyFor(fullPhrase, triedItems);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  if (__DEV__) console.log(`[PredCache] HIT "${fullPhrase}"`);
  return entry.predictions;
}

// Fire-and-forget prefetch. Returns nothing — store the result in cache for
// later sync lookup. Dedupes in-flight requests by key.
export function prefetchPredictions(
  fullPhrase: string,
  timeOfDay: TimeOfDay,
  triedItems?: string[],
): void {
  const key = keyFor(fullPhrase, triedItems);

  if (cache.has(key)) {
    const entry = cache.get(key)!;
    if (Date.now() <= entry.expiresAt) return;
  }
  if (inflight.has(key)) return;

  if (__DEV__) console.log(`[PredCache] PREFETCH "${fullPhrase}"`);

  const promise = getPredictions(fullPhrase, timeOfDay, triedItems)
    .then((predictions) => {
      cache.set(key, {
        predictions,
        expiresAt: Date.now() + TTL_MS,
        source: 'cache',
      });
      return predictions;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, { promise });
}

// Await an in-flight prefetch if one exists, otherwise fetch fresh.
// Returns the predictions plus the source so callers can log perceived speed.
export async function getOrFetchPredictions(
  fullPhrase: string,
  timeOfDay: TimeOfDay,
  triedItems?: string[],
): Promise<{ predictions: ComposeItem[]; source: 'cache' | 'inflight' | 'cold' }> {
  const cached = getCachedPredictions(fullPhrase, triedItems);
  if (cached) return { predictions: cached, source: 'cache' };

  const key = keyFor(fullPhrase, triedItems);
  const existing = inflight.get(key);
  if (existing) {
    if (__DEV__) console.log(`[PredCache] AWAIT-INFLIGHT "${fullPhrase}"`);
    const predictions = await existing.promise;
    return { predictions, source: 'inflight' };
  }

  if (__DEV__) console.log(`[PredCache] COLD "${fullPhrase}"`);
  const predictions = await getPredictions(fullPhrase, timeOfDay, triedItems);
  cache.set(key, {
    predictions,
    expiresAt: Date.now() + TTL_MS,
    source: 'cache',
  });
  return { predictions, source: 'cold' };
}

// Test-only — clears all cached + inflight entries.
export function _resetCache(): void {
  cache.clear();
  inflight.clear();
}
