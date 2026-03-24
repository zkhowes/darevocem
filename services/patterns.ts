import { supabase } from './supabase';
import { getTimeOfDay, getDayOfWeek } from './context';
import type { UsageEvent, SessionTrace, ItemType, EventType, ScreenType } from '../types';
import { useCompositionStore } from '../stores/composition';

/**
 * Logs a single interaction event to Supabase.
 * Every Amanda interaction feeds the pattern learning pipeline —
 * this is not optional telemetry, it's the core learning mechanism.
 */
export async function logUsageEvent(
  eventType: EventType,
  screen: ScreenType,
  intent: string | null,
  itemText: string | null,
  itemType: ItemType | null,
  phraseSoFar: string,
  finalPhrase: string | null = null,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const event: Omit<UsageEvent, 'id' | 'created_at'> = {
    user_id: session.user.id,
    session_id: useCompositionStore.getState().sessionId,
    event_type: eventType,
    screen,
    intent,
    item_text: itemText,
    item_type: itemType,
    phrase_so_far: phraseSoFar,
    final_phrase: finalPhrase,
    time_of_day: getTimeOfDay(),
    day_of_week: getDayOfWeek(),
    metadata: {},
  };

  const { error } = await supabase.from('usage_events').insert(event);
  if (error) {
    console.error('Failed to log event:', error);
  }
}

/**
 * Saves the full session trace when a phrase composition session ends.
 * Captures the complete path Amanda took: every selection, rejection,
 * refinement, and undo — plus timing metrics for future analysis.
 */
export async function saveSessionTrace(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const state = useCompositionStore.getState();
  const now = Date.now();

  const events = state.events;
  const selections = events.filter((e) => e.action === 'select');
  const rejections = events.filter((e) => e.action === 'reject');
  const refinements = events.filter((e) => e.action === 'refine');
  const undos = events.filter((e) => e.action === 'undo');

  const trace: Omit<SessionTrace, 'started_at' | 'completed_at'> & {
    started_at: string;
    completed_at: string;
  } = {
    session_id: state.sessionId,
    user_id: session.user.id,
    intent_selected: state.intent ?? '',
    intent_cycle_count: state.intentCycleCount,
    steps: events,
    final_phrase: state.getPhrase() || null,
    outcome: 'abandoned',
    time_intent_to_phrase_ms: now - state.startedAt,
    time_intent_selection_ms: events.length > 0 ? events[0].timestamp_ms : 0,
    total_selections: selections.length,
    total_rejections: rejections.length,
    total_refinements: refinements.length,
    total_undos: undos.length,
    prediction_hit_rank: selections.map((s) => s.item_rank ?? -1),
    time_of_day: getTimeOfDay(),
    day_of_week: getDayOfWeek(),
    started_at: new Date(state.startedAt).toISOString(),
    completed_at: new Date(now).toISOString(),
  };

  const { error } = await supabase.from('session_traces').insert(trace);
  if (error) {
    console.error('Failed to save trace:', error);
  }
}
