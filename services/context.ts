import type { TimeOfDay } from '../types';

/**
 * Returns the current time-of-day bucket used to seed intent defaults
 * and tailor prediction context sent to Claude.
 */
export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Returns the current day of week in lowercase English (e.g. "monday").
 * Used as context metadata in prediction requests and session traces.
 */
export function getDayOfWeek(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
}
