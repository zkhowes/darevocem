/**
 * Map a touchY coordinate (relative to the WheelPicker's GestureArea) to the
 * index of the row that was tapped, given each row's measured top + height.
 *
 * Used by WheelPicker so a double-tap on a non-focused row (e.g. P3 while P1
 * is focused) selects THAT row instead of always firing on the focused one,
 * without losing swipe-anywhere on the whole list.
 *
 * Returns null when touchY is outside every row, the row map is empty, or
 * touchY is undefined (caller falls back to the focused index).
 *
 * Pulled out of WheelPicker.tsx so it can be unit-tested without pulling in
 * react-native-reanimated (which doesn't load in the jest environment).
 */
export function findRowAtTouchY(
  touchY: number | undefined,
  rowLayouts: ReadonlyMap<number, { y: number; height: number }>,
): number | null {
  if (touchY == null || rowLayouts.size === 0) return null;
  for (const [index, { y, height }] of rowLayouts) {
    if (touchY >= y && touchY < y + height) return index;
  }
  return null;
}
