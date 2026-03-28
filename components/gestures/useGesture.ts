import { useRef, useCallback, useMemo, useEffect } from 'react';
import { PanResponder, type GestureResponderEvent, type PanResponderGestureState } from 'react-native';
import type { GestureAction, GestureConfig } from '../../types';
import { GESTURE } from '../../constants/config';

interface UseGestureOptions {
  onAction: (action: GestureAction) => void;
  config?: Partial<GestureConfig>;
}

// === Pure logic — exported for testing ===

/**
 * Classify a touch gesture as a swipe based on displacement.
 * Returns null if displacement is below the swipe threshold (i.e. it's a tap).
 * Diagonal movements resolve to the dominant axis.
 */
/**
 * Minimum ratio between dominant and secondary axis to classify as a
 * directional swipe. Gestures where both axes are within this ratio of
 * each other are treated as ambiguous diagonals and ignored.
 * 1.5 means the dominant axis must be at least 1.5x the secondary axis.
 */
const SWIPE_AXIS_RATIO = 1.5;

export function classifyGesture(
  dx: number,
  dy: number,
  duration: number,
  config: GestureConfig,
): GestureAction | null {
  const { swipeThresholdPx } = config;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx > swipeThresholdPx || absDy > swipeThresholdPx) {
    // Reject ambiguous diagonals — dominant axis must clearly win
    const dominant = Math.max(absDx, absDy);
    const secondary = Math.min(absDx, absDy);
    if (secondary > 0 && dominant / secondary < SWIPE_AXIS_RATIO) {
      if (__DEV__) {
        console.log(`[Gesture] diagonal rejected (dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)}, ratio=${(dominant / secondary).toFixed(2)})`);
      }
      return null; // Ambiguous diagonal — treat as no-op
    }

    if (absDx > absDy) {
      return { type: 'swipe', direction: dx > 0 ? 'right' : 'left' };
    } else {
      return { type: 'swipe', direction: dy > 0 ? 'down' : 'up' };
    }
  }

  return null; // Not a swipe — tap/double-tap handled by tap timer
}

// === Tap/double-tap state for the pure helper ===
// Shared mutable state used by processTapEvent. In production this lives
// inside the hook's refs, but we expose it here so tests can exercise
// the tap/double-tap timing logic without mounting React components.

let _lastTapTime = 0;
let _tapTimeout: ReturnType<typeof setTimeout> | null = null;

/** Reset tap state — call between tests */
export function resetTapState(): void {
  _lastTapTime = 0;
  if (_tapTimeout) {
    clearTimeout(_tapTimeout);
    _tapTimeout = null;
  }
}

/**
 * Process a potential tap event. Implements the double-tap disambiguation:
 * - If a second tap arrives within doubleTapMaxDelayMs, emit double-tap.
 * - Otherwise, wait doubleTapMaxDelayMs and emit single tap.
 * Respects `enabled` flag.
 */
export function processTapEvent(
  onAction: (action: GestureAction) => void,
  config: GestureConfig,
): void {
  if (!config.enabled) return;

  const now = Date.now();
  const timeSinceLastTap = now - _lastTapTime;

  if (timeSinceLastTap < config.doubleTapMaxDelayMs) {
    // Double tap detected
    if (_tapTimeout) clearTimeout(_tapTimeout);
    _tapTimeout = null;
    _lastTapTime = 0;
    onAction({ type: 'double-tap' });
  } else {
    // Potential single tap — wait to see if double-tap follows
    _lastTapTime = now;
    _tapTimeout = setTimeout(() => {
      onAction({ type: 'tap' });
      _lastTapTime = 0;
      _tapTimeout = null;
    }, config.doubleTapMaxDelayMs);
  }
}

// === Long press helpers for testing ===

let _longPressTimeout: ReturnType<typeof setTimeout> | null = null;

export function startLongPressTimer(
  onAction: (action: GestureAction) => void,
  config: GestureConfig,
): void {
  cancelLongPressTimer();
  _longPressTimeout = setTimeout(() => {
    onAction({ type: 'long-press' });
    _longPressTimeout = null;
  }, config.longPressMs);
}

export function cancelLongPressTimer(): void {
  if (_longPressTimeout) {
    clearTimeout(_longPressTimeout);
    _longPressTimeout = null;
  }
}

// === React hook — uses the pure logic above ===

export function useGesture({ onAction, config: configOverrides }: UseGestureOptions) {
  const config: GestureConfig = {
    swipeThresholdPx: configOverrides?.swipeThresholdPx ?? GESTURE.swipeThresholdPx,
    doubleTapMaxDelayMs: configOverrides?.doubleTapMaxDelayMs ?? GESTURE.doubleTapMaxDelayMs,
    longPressMs: configOverrides?.longPressMs ?? GESTURE.longPressMs,
    enabled: configOverrides?.enabled ?? true,
  };

  // Ref keeps PanResponder in sync with latest onAction without recreating it.
  // Without this, the PanResponder captures a stale closure and calls outdated handlers
  // (e.g., IntentSection: collapsed handler keeps running after expanding).
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    if (longPressTimeoutRef.current) clearTimeout(longPressTimeoutRef.current);
  }, []);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => config.enabled,
    onMoveShouldSetPanResponder: () => config.enabled,

    onPanResponderGrant: () => {
      if (!config.enabled) return;
      isLongPressRef.current = false;

      // Start long press timer
      longPressTimeoutRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onActionRef.current({ type: 'long-press' });
      }, config.longPressMs);
    },

    onPanResponderMove: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      // If moved enough to be a swipe, cancel long press
      const { dx, dy } = gestureState;
      if (Math.abs(dx) > GESTURE.longPressCancelMovePx || Math.abs(dy) > GESTURE.longPressCancelMovePx) {
        if (longPressTimeoutRef.current) {
          clearTimeout(longPressTimeoutRef.current);
          longPressTimeoutRef.current = null;
        }
      }
    },

    onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
      if (!config.enabled) return;
      // Cancel long press timer
      if (longPressTimeoutRef.current) {
        clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }

      // If long press already fired, do nothing
      if (isLongPressRef.current) return;

      const { dx, dy } = gestureState;
      const swipeAction = classifyGesture(dx, dy, 0, config);

      if (swipeAction) {
        if (__DEV__) {
          const dir = swipeAction.type === 'swipe' ? swipeAction.direction : '';
          console.log(`[Gesture] ${swipeAction.type}:${dir} (dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)})`);
        }
        onActionRef.current(swipeAction);
        return;
      }

      // Not a swipe — handle as tap/double-tap
      if (__DEV__) {
        console.log(`[Gesture] tap candidate (dx=${dx.toFixed(0)}, dy=${dy.toFixed(0)})`);
      }
      const now = Date.now();
      const timeSinceLastTap = now - lastTapRef.current;

      if (timeSinceLastTap < config.doubleTapMaxDelayMs) {
        // Double tap
        if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        lastTapRef.current = 0;
        onActionRef.current({ type: 'double-tap' });
      } else {
        // Potential single tap — wait to see if double-tap follows
        lastTapRef.current = now;
        tapTimeoutRef.current = setTimeout(() => {
          onActionRef.current({ type: 'tap' });
          lastTapRef.current = 0;
        }, config.doubleTapMaxDelayMs);
      }
    },

    onPanResponderTerminate: () => {
      clearTimers();
    },
  }), [config.enabled, config.swipeThresholdPx, config.doubleTapMaxDelayMs, config.longPressMs]);

  return { panHandlers: panResponder.panHandlers };
}
