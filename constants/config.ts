export const GESTURE = {
  swipeThresholdPx: 50,
  doubleTapMaxDelayMs: 300,
  longPressMs: 2000,
  sensitivityLevels: { low: 1.5, medium: 1.0, high: 0.7 } as const,
} as const;

export const TIMING = {
  apiTimeoutMs: 2000,
  focusAnimationMs: 150,
  intentCycleMs: 200,
  itemRejectMs: 200,
  itemRefineMs: 300,
  phraseWordMs: 150,
  contextMenuMs: 200,
  statePersistDebounceMs: 500,
} as const;

export const LAYOUT = {
  listItemHeight: 72,
  headerHeight: 80,
  phraseBarHeight: 80,
  flowCardHeight: 88,
  itemGap: 12,
  screenPadding: 20,
  focusBorderWidth: 4,
  focusScale: 1.02,
} as const;

export const TYPOGRAPHY = {
  header: { size: 32, weight: '700' as const },
  listItem: { size: 24, weight: '500' as const },
  itemLabel: { size: 14, weight: '400' as const },
  phraseBar: { size: 28, weight: '600' as const },
  navBar: { size: 18, weight: '400' as const },
} as const;

export const OFFLINE = {
  maxQueueSize: 500,
  recentSelectionsCache: 20,
} as const;
