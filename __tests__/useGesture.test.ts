import {
  classifyGesture,
  processTapEvent,
  resetTapState,
  startLongPressTimer,
  cancelLongPressTimer,
} from '../components/gestures/useGesture';
import type { GestureConfig } from '../types';

const defaultConfig: GestureConfig = {
  swipeThresholdPx: 50,
  doubleTapMaxDelayMs: 300,
  longPressMs: 2000,
  enabled: true,
};

describe('classifyGesture', () => {
  it('recognizes swipe right when dx > threshold', () => {
    const result = classifyGesture(80, 5, 100, defaultConfig);
    expect(result).toEqual({ type: 'swipe', direction: 'right' });
  });

  it('recognizes swipe left when dx < -threshold', () => {
    const result = classifyGesture(-80, 5, 100, defaultConfig);
    expect(result).toEqual({ type: 'swipe', direction: 'left' });
  });

  it('recognizes swipe up when dy < -threshold', () => {
    const result = classifyGesture(5, -80, 100, defaultConfig);
    expect(result).toEqual({ type: 'swipe', direction: 'up' });
  });

  it('recognizes swipe down when dy > threshold', () => {
    const result = classifyGesture(5, 80, 100, defaultConfig);
    expect(result).toEqual({ type: 'swipe', direction: 'down' });
  });

  it('returns null when distance is below threshold (potential tap)', () => {
    const result = classifyGesture(10, 5, 100, defaultConfig);
    expect(result).toBeNull();
  });

  it('resolves diagonal swipe to dominant horizontal axis', () => {
    const result = classifyGesture(80, 60, 100, defaultConfig);
    expect(result).toEqual({ type: 'swipe', direction: 'right' });
  });

  it('resolves diagonal swipe to dominant vertical axis', () => {
    const result = classifyGesture(40, -90, 100, defaultConfig);
    expect(result).toEqual({ type: 'swipe', direction: 'up' });
  });

  it('respects custom swipe threshold', () => {
    const highThreshold: GestureConfig = { ...defaultConfig, swipeThresholdPx: 100 };
    const result = classifyGesture(80, 5, 100, highThreshold);
    expect(result).toBeNull();
  });
});

describe('tap and double-tap timing', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetTapState();
  });

  afterEach(() => {
    resetTapState();
    jest.useRealTimers();
  });

  it('emits single tap after doubleTapMaxDelayMs with no follow-up', () => {
    const onAction = jest.fn();

    processTapEvent(onAction, defaultConfig);
    // Tap should not fire immediately
    expect(onAction).not.toHaveBeenCalled();

    // Advance past the double-tap window
    jest.advanceTimersByTime(301);
    expect(onAction).toHaveBeenCalledWith({ type: 'tap' });
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('emits double-tap when two taps occur within doubleTapMaxDelayMs', () => {
    const onAction = jest.fn();

    // First tap
    processTapEvent(onAction, defaultConfig);
    jest.advanceTimersByTime(150); // within 300ms window

    // Second tap
    processTapEvent(onAction, defaultConfig);

    expect(onAction).toHaveBeenCalledWith({ type: 'double-tap' });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('long press', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cancelLongPressTimer();
    jest.useRealTimers();
  });

  it('emits long-press after longPressMs', () => {
    const onAction = jest.fn();

    startLongPressTimer(onAction, defaultConfig);
    expect(onAction).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2001);
    expect(onAction).toHaveBeenCalledWith({ type: 'long-press' });
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('enabled flag', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetTapState();
  });

  afterEach(() => {
    resetTapState();
    jest.useRealTimers();
  });

  it('does not emit tap when enabled is false', () => {
    const disabledConfig: GestureConfig = { ...defaultConfig, enabled: false };
    const onAction = jest.fn();

    processTapEvent(onAction, disabledConfig);
    jest.advanceTimersByTime(301);

    expect(onAction).not.toHaveBeenCalled();
  });
});
