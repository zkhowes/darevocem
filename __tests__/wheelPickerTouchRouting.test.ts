import { findRowAtTouchY } from '../utils/wheelPickerTouchRouting';

/**
 * Tests the touchY → row-index mapping used by WheelPicker to route a
 * double-tap to the row actually pressed (vs the focused row). This is the
 * core of Bug 5's fix — get it right and double-tapping P3 selects P3 even
 * when P1 is focused.
 *
 * `findRowAtTouchY` is pure: given a touchY and the rows' measured
 * {y, height}, return the index whose vertical band contains the touch.
 */

function rowMap(rows: { y: number; height: number }[]): Map<number, { y: number; height: number }> {
  const m = new Map<number, { y: number; height: number }>();
  rows.forEach((r, i) => m.set(i, r));
  return m;
}

describe('findRowAtTouchY', () => {
  it('returns the row whose band contains touchY', () => {
    // 3 rows: 0..72, 84..156, 168..240 (72px + 12px gap, focused row excluded for simplicity)
    const map = rowMap([
      { y: 0, height: 72 },
      { y: 84, height: 72 },
      { y: 168, height: 72 },
    ]);
    expect(findRowAtTouchY(10, map)).toBe(0);
    expect(findRowAtTouchY(100, map)).toBe(1);
    expect(findRowAtTouchY(200, map)).toBe(2);
  });

  it('returns null when touchY falls in the gap between rows', () => {
    const map = rowMap([
      { y: 0, height: 72 },
      { y: 84, height: 72 },
    ]);
    expect(findRowAtTouchY(78, map)).toBeNull(); // in the 12px gap
  });

  it('returns null when touchY is past the last row', () => {
    const map = rowMap([{ y: 0, height: 72 }]);
    expect(findRowAtTouchY(500, map)).toBeNull();
  });

  it('returns null when touchY is undefined (caller falls back to focused)', () => {
    const map = rowMap([{ y: 0, height: 72 }]);
    expect(findRowAtTouchY(undefined, map)).toBeNull();
  });

  it('returns null when the row map is empty', () => {
    expect(findRowAtTouchY(50, new Map())).toBeNull();
  });

  it('handles a focused (taller) row mixed with unfocused rows — the actual WheelPicker case', () => {
    // The focused row is 120px tall instead of 72 — Bug 5 has to route correctly
    // even when row heights vary. Simulate the focused row at index 1:
    //   row 0: y=0,   h=72   → 0..72
    //   row 1: y=84,  h=120  → 84..204   (focused)
    //   row 2: y=216, h=72   → 216..288
    const map = rowMap([
      { y: 0, height: 72 },
      { y: 84, height: 120 },
      { y: 216, height: 72 },
    ]);
    expect(findRowAtTouchY(40, map)).toBe(0);
    expect(findRowAtTouchY(150, map)).toBe(1); // inside the tall focused row
    expect(findRowAtTouchY(250, map)).toBe(2);
  });

  it('zero exactly matches the top edge of the first row (inclusive)', () => {
    const map = rowMap([{ y: 0, height: 72 }]);
    expect(findRowAtTouchY(0, map)).toBe(0);
  });

  it('the bottom edge of a row is exclusive (touchY = y + height belongs to neither)', () => {
    const map = rowMap([
      { y: 0, height: 72 },
      { y: 84, height: 72 },
    ]);
    // touchY exactly equals row 0's bottom (72) is in the gap — null is correct.
    expect(findRowAtTouchY(72, map)).toBeNull();
  });
});
