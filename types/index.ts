// === Gesture System ===

export type SwipeDirection = 'up' | 'down' | 'left' | 'right';

export type GestureAction =
  | { type: 'swipe'; direction: SwipeDirection }
  | { type: 'tap' }
  | { type: 'double-tap' }
  | { type: 'long-press' };

export interface GestureConfig {
  swipeThresholdPx: number;
  doubleTapMaxDelayMs: number;
  longPressMs: number;
  enabled: boolean;
}

// === Focus System ===

export type FocusSection = 'intent' | 'compose' | 'phrase';

export interface FocusState {
  section: FocusSection;
  composeIndex: number;
}

// === Utilities ===

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// === Composition ===

export type SlotType = 'object' | 'modifier' | 'qualifier';

// Fitzgerald Key word categories for color coding.
// Maps to the Modified Fitzgerald Key — the universal color system used across AAC apps.
export type WordType =
  | 'verb'        // green — actions: go, want, need, eat
  | 'noun'        // orange — things: water, coffee, phone
  | 'descriptor'  // blue — adjectives: tired, cold, more
  | 'person'      // yellow — people: I, you, family
  | 'question'    // purple — what, where, when
  | 'negation'    // red — no, don't, stop
  | 'social'      // pink — please, thank you, hello
  | 'misc';       // grey — and, the, but

// Display density for progressive disclosure (simplified mode)
export type DisplayDensity = 'standard' | 'simplified';

export interface Prediction {
  text: string;
  type: SlotType;
}

export type ItemType = 'prediction' | 'common' | 'recent' | 'saved';

export interface ComposeItem {
  id: string;
  text: string;
  itemType: ItemType;
  rank: number;
  label?: string;
  value?: string;
  isDynamic?: boolean;
  wordType?: WordType;
}

export interface WheelPickerItem {
  id: string;
  text: string;
  itemType: 'prediction' | 'common' | 'saved';
  color: string;
  metadata?: Record<string, unknown>;
}

export interface PredictionHistoryEntry {
  predictions: ComposeItem[];
  slot: string;
  // 'advance' = double-tap added a slot; 'refine' = right-swipe explored alternatives (no slot added).
  // backtrack() only removes a slot when popping an 'advance' entry.
  source: 'advance' | 'refine';
}

export interface ModifierState {
  targetItem: string;
  modifiers: string[];
  currentIndex: number;
}

export interface CompositionState {
  sessionId: string;
  intent: string | null;
  slots: string[];
  undoStack: string[];
  predictions: ComposeItem[];
  isLoading: boolean;
  startedAt: number;
  events: SessionStep[];
}

// === Intents ===

export interface IntentDefinition {
  text: string;
  addsToPhrase: boolean;
}

// === Logging ===

export type EventType = 'select' | 'reject' | 'refine' | 'modify' | 'speak' | 'save' | 'abandon';
export type ScreenType = 'compose' | 'common' | 'saved';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type SessionOutcome = 'spoken' | 'spoken_imperfect' | 'saved' | 'abandoned';

export interface UsageEvent {
  id?: string;
  user_id: string;
  session_id: string;
  event_type: EventType;
  screen: ScreenType;
  intent: string | null;
  item_text: string | null;
  item_type: ItemType | null;
  phrase_so_far: string;
  final_phrase: string | null;
  time_of_day: TimeOfDay;
  day_of_week: string;
  metadata: Record<string, unknown>;
  created_at?: string;
}

export type StepAction = 'select' | 'reject' | 'refine' | 'modify' | 'undo' | 'redo' | 'focus_change' | 'advance' | 'backtrack' | 'diverge';

export interface SessionStep {
  action: StepAction;
  item_text: string | null;
  item_type: ItemType | null;
  item_rank: number | null;
  phrase_state: string;
  timestamp_ms: number;
}

export interface SessionTrace {
  session_id: string;
  user_id: string;
  intent_selected: string;
  intent_cycle_count: number;
  steps: SessionStep[];
  final_phrase: string | null;
  outcome: SessionOutcome;
  time_intent_to_phrase_ms: number;
  time_intent_selection_ms: number;
  total_selections: number;
  total_rejections: number;
  total_refinements: number;
  total_undos: number;
  prediction_hit_rank: number[];
  time_of_day: TimeOfDay;
  day_of_week: string;
  started_at: string;
  completed_at: string;
}

// === Common Items ===

export interface CommonItem {
  id: string;
  user_id: string;
  label: string;
  value: string;
  category: string;
  is_dynamic: boolean;
  sort_order: number;
}

// === Saved Phrases ===

export interface SavedPhrase {
  id: string;
  user_id: string;
  text: string;
  category: string;
  sort_order: number;
}

// === Preferences ===

export type ThemeMode = 'light' | 'dark';

export interface Preferences {
  theme: ThemeMode;
  textScale: number;
  speechRate: number;
  useSystemTtsOnly: boolean;
  showFallbackButtons: boolean;
  gestureConfig: Partial<GestureConfig>;
  auditoryPreview: boolean;
  displayDensity: DisplayDensity;
}

// === Auth ===

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  role: UserRole;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  homeAddress: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  onboardingComplete: boolean;
}

// === API Responses ===

export interface PredictionResponse {
  predictions: Prediction[];
  fallback: boolean;
}
