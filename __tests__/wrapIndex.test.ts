/**
 * Tests for the carousel'\''s wrap helper. The InputCarousel relies on this
 * for both visible-slot index math (slots [-2..2] relative to focus) and
 * the focus-commit handler (swipe past last item -> back to first).
 *
 * If wrap is off-by-one we get silent visual bugs — wrong item rendered at
 * the focused position, or focus jumping past instead of wrapping. These
 * regression tests cover the cases that matter.
 */

import { wrapIndex } from '../utils/wrapIndex';

describe('wrapIndex — 4-item carousel (mic/pen/abc/cam, today\'s config)', () => {
  const COUNT = 4;

  it('handles in-range indices unchanged', () => {
    expect(wrapIndex(0, COUNT)).toBe(0);
    expect(wrapIndex(1, COUNT)).toBe(1);
    expect(wrapIndex(2, COUNT)).toBe(2);
    expect(wrapIndex(3, COUNT)).toBe(3);
  });

  it('wraps -1 to 3 (swipe right from mic shows cam)', () => {
    expect(wrapIndex(-1, COUNT)).toBe(3);
  });

  it('wraps -2 to 2 (two slots left of mic shows abc)', () => {
    expect(wrapIndex(-2, COUNT)).toBe(2);
  });

  it('wraps 4 to 0 (swipe past cam returns to mic)', () => {
    expect(wrapIndex(4, COUNT)).toBe(0);
  });

  it('wraps 5 to 1', () => {
    expect(wrapIndex(5, COUNT)).toBe(1);
  });

  it('handles large positive overflow', () => {
    expect(wrapIndex(8, COUNT)).toBe(0);
    expect(wrapIndex(101, COUNT)).toBe(1);
  });

  it('handles large negative overflow', () => {
    expect(wrapIndex(-100, COUNT)).toBe(0); // -100 % 4 = 0 in math; module wraps that
    expect(wrapIndex(-99, COUNT)).toBe(1);
  });
});

describe('wrapIndex — future 6-item carousel (after photo-upload + scan-text ship)', () => {
  const COUNT = 6;

  it('handles negative wrap at the boundary', () => {
    expect(wrapIndex(-1, COUNT)).toBe(5);
  });

  it('handles positive wrap at the boundary', () => {
    expect(wrapIndex(6, COUNT)).toBe(0);
  });
});

describe('wrapIndex — degenerate cases', () => {
  it('count=1: every index maps to 0', () => {
    expect(wrapIndex(0, 1)).toBe(0);
    expect(wrapIndex(-1, 1)).toBe(0);
    expect(wrapIndex(42, 1)).toBe(0);
  });

  it('count=0: returns 0 rather than NaN', () => {
    // Caller guard, but the helper shouldn'\''t produce NaN if called by mistake
    expect(wrapIndex(0, 0)).toBe(0);
    expect(wrapIndex(5, 0)).toBe(0);
    expect(wrapIndex(-5, 0)).toBe(0);
  });

  it('count=-1 (programmer error): returns 0 rather than crashing', () => {
    expect(wrapIndex(3, -1)).toBe(0);
  });
});
