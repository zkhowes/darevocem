/**
 * Wraps an index into the range [0, count). Used by InputCarousel to allow
 * swiping past the last item back to the first (and vice versa).
 *
 * Handles negative indices: wrapIndex(-1, 4) === 3.
 * Handles out-of-bound positives: wrapIndex(5, 4) === 1.
 * Degenerate count=0 returns 0 (caller should guard against this anyway).
 *
 * Extracted from components/shared/InputCarousel.tsx so the math is testable
 * with Jest. The carousel uses it for both the visible-slot index computation
 * and the focus-commit handler.
 */
export function wrapIndex(i: number, count: number): number {
  if (count <= 0) return 0;
  return ((i % count) + count) % count;
}
