# Dare Vocem — Design Spec

*Latin: "to give voice"*

**Date:** 2026-03-23
**Author:** zkhowes + Claude
**Status:** Draft

---

## 1. Purpose

Amanda Howes has a brain tumor causing aphasia. She knows what she wants to say but can't get the words out. She can start most sentences and finish non-sequiturs, then gets stuck mid-sentence.

Dare Vocem helps her compose and speak complete sentences through a gesture-driven, predictive interface. She navigates intents, predictions, and modifiers through swipes and taps, and the app speaks the composed phrase aloud in her cloned voice.

**The app doesn't replace Amanda's voice — it finishes what she starts.**

This is not a general-purpose AAC platform. This is software for Amanda, built by her husband, to keep her in conversation with the people she loves.

---

## 2. Amanda's Aphasia Profile

All agents working on this project must understand this:

- Amanda can say a LOT today. She can finish non-sequiturs and start most sentences. Then she gets stuck mid-sentence and can't find the next word.
- Her comprehension is fully intact. She knows exactly what she wants to say — the bottleneck is word retrieval and sentence completion, not understanding.
- Today: the Compose flow helps her build sentences via gesture when she can't get the words out.
- Near-term (Record flow): the app listens to Amanda speak, detects where she stalls, and offers completions from that point forward. This is the highest-impact feature long-term.
- Long-term: as her condition progresses, she'll rely more on full phrase selection and less on sentence starts. The app must gracefully shift from "sentence completer" to "full phrase speaker" over time.

---

## 3. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Expo SDK 52 (React Native), iOS primary | Amanda has an iPhone. Expo Go for rapid iteration, dev builds for native features. |
| Language | TypeScript | Type safety catches bugs before Amanda encounters them. |
| Auth | Supabase Auth (Google Sign-In now, Apple Sign-In when developer account approved) | Native auth on iOS. Protects Amanda's private data. |
| Backend | Supabase (Postgres + RLS + Edge Functions) | Auth, database, RLS, and API proxies in one. No separate server to maintain. |
| API Proxy | Supabase Edge Functions | Claude and ElevenLabs API keys stay server-side. No keys on the device. |
| AI Prediction | Anthropic Claude API (claude-sonnet-4-20250514) via Edge Function | Contextual slot predictions, refinement, modifier generation. |
| Text-to-Speech | ElevenLabs API (eleven_flash_v2_5) via Edge Function | Amanda's cloned voice (placeholder voice until clone ready). System TTS as offline fallback. |
| State Management | Zustand | Tiny, simple, no boilerplate. |
| Local Cache | AsyncStorage | Offline access to saved phrases, common items, recent patterns. |

### Development & Distribution

- **Dev testing:** Expo Go initially (gesture model, UI iteration), graduating to dev builds when Apple Sign-In and audio streaming are needed.
- **Distribution:** EAS Build -> TestFlight -> Amanda's phone. Push to `main` triggers build.
- **Admin (MVP 1.0-1.1):** Supabase Dashboard for CRUD (phrases, common items) and raw data viewing. No custom admin UI — the husband manages data directly in Supabase's table editor.
- **Admin (MVP 1.2):** Lightweight Next.js web app on Vercel for session analytics, pattern visualization, and training insights. CRUD stays in Supabase Dashboard.

### Security Principles

- No API keys on the device, ever. All external API calls route through Supabase Edge Functions.
- All data behind Supabase Row Level Security. No anonymous access.
- Auth required on cold start.

---

## 4. Project Structure

```
darevocem/
  app/
    _layout.tsx                     # Root layout, auth guard, error boundary
    login.tsx                       # Google Sign-In (Apple Sign-In MVP 1.2)
    (tabs)/
      index.tsx                     # Home — 4 flow cards
      compose.tsx                   # Compose screen (Predicted flow)
      common.tsx                    # Common items screen
      saved.tsx                     # Saved phrases screen
      settings.tsx                  # Amanda's preferences only
  components/
    gestures/
      useGesture.ts                 # Shared gesture interpreter hook
      GestureArea.tsx               # Wrapper that applies useGesture to a view
      FallbackButtons.tsx           # Tap-based alternatives for accessibility (WCAG 2.5.1)
    sections/
      SectionLayout.tsx             # Shared 4-section layout (Nav, Header, Items, Phrase)
      IntentSection.tsx             # Header for Compose: intent display + cycling
      ComposeSection.tsx            # Items for Compose: prediction list + focus
      PhraseSection.tsx             # Phrase bar: composed phrase + undo/redo/speak
      CategoryHeader.tsx            # Header for Common/Saved: category cycling
    shared/
      FocusIndicator.tsx            # Visual focus state — animated, high contrast
      ContextMenu.tsx               # 2s hold menu: keyboard, camera, mic, save
      SpeakButton.tsx               # Trigger TTS (MVP 1.1)
      ErrorBoundary.tsx             # Catches crashes, shows fallback UI
      OfflineBanner.tsx             # Connectivity status indicator
    home/
      FlowCard.tsx                  # Home screen cards
  services/
    supabase.ts                     # Supabase client + auth helpers
    predictions.ts                  # Calls Edge Function /predict
    tts.ts                          # Calls Edge Function /speak + system TTS fallback
    context.ts                      # Time-of-day, session context
    patterns.ts                     # Read/write usage patterns from Supabase
    offline.ts                      # AsyncStorage cache layer + sync queue
  stores/
    auth.ts                         # Auth state
    focus.ts                        # Focus state machine (which section, which item)
    composition.ts                  # Phrase composition state (slots, undo/redo stack)
    preferences.ts                  # Settings (synced to Supabase)
  types/
    index.ts                        # Shared TypeScript types
  constants/
    config.ts                       # Gesture thresholds, timing, design tokens
    intents.ts                      # Curated intent definitions
    fallbacks.ts                    # Offline fallback predictions per intent
  supabase/
    functions/
      predict/index.ts              # Edge Function: Claude API proxy
      speak/index.ts                # Edge Function: ElevenLabs API proxy
    migrations/
      001_initial_schema.sql        # Tables, RLS policies
```

---

## 5. Gesture System

### Approach: Hybrid (C) with Fallback Path to (A)

A shared `useGesture` hook interprets raw touch events into semantic actions. Each section component uses this hook but maps the semantic actions to section-specific behavior. A focus manager (Zustand) coordinates which section is active.

```
Touch Event -> useGesture hook -> Semantic Action -> Section Handler -> State Update
```

If the shared hook doesn't work out, each section can fall back to handling raw gestures directly (Approach A). The section handler interface stays the same — only the gesture detection layer swaps.

### Gesture Actions

```typescript
type GestureAction =
  | { type: 'swipe'; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'tap' }
  | { type: 'double-tap' }
  | { type: 'long-press' };

interface UseGestureConfig {
  swipeThresholdPx?: number;      // default 50, tunable
  doubleTapMaxDelayMs?: number;   // default 300
  longPressMs?: number;           // default 2000
  enabled?: boolean;              // disable during loading, TTS, etc.
}
```

### Key Decisions

1. **Tap vs double-tap:** 300ms wait after first tap to disambiguate. Configurable.
2. **Swipe vs scroll:** No free scrolling. Swipe up/down moves focus item-by-item. List auto-scrolls to keep focused item visible.
3. **Gesture boundaries:** Touches that start in one section and end in another are ignored.
4. **WCAG 2.5.1:** Every swipe has a tap-based fallback button alternative. Hidden by default, toggleable in Settings.

### Focus State Machine

```typescript
interface FocusState {
  section: 'intent' | 'compose' | 'phrase';
  composeIndex: number;
}
```

Transitions:
- `intent` + swipe down -> `compose` (index 0)
- `intent` + double-tap -> `compose` (index 0), intent added to phrase
- `compose` + swipe down -> increment composeIndex (or `phrase` if at last item)
- `compose` + swipe up -> decrement composeIndex (or `intent` if at index 0)
- `phrase` + swipe up -> `compose` (restores previous composeIndex)
- `intent` + swipe up -> navigate Home

**Compose-to-Phrase transition note:** Amanda reaches the Phrase section by swiping down past the last item in the Compose list. If she has a long list and wants to speak her partial phrase without scrolling through all items, she can use the 2s hold context menu from anywhere in Compose, which includes "Save" — or she can double-tap any item to add it and keep building. The long-press "Speak even though not quite right" is available in the Phrase section once she reaches it. This is a gap-fill not specified in the original PRD.

Focus never moves without a gesture. Amanda is always in control.

---

## 6. Screens

### Home Screen

Four cards:
- **Record** — "Coming soon" placeholder (Phase 2)
- **Predicted** — opens Compose screen
- **Common** — opens Common Items screen
- **Saved** — opens Saved Phrases screen

### Shared Section Layout

All three main screens (Compose, Common, Saved) use a shared `SectionLayout` component:

```
Nav Bar           (static, not focusable)
Header            (Intent / Category name)
Item List         (Predictions / Common Items / Saved Phrases)
Phrase Bar        (composed phrase, undo/redo, speak)
```

Each screen provides: header content, header swipe behavior, item list content, per-item gesture responses, and whether the header text gets added to the phrase.

### Compose Screen (Predicted Flow)

**Section 2 — Intent:**
- Large text (32px bold), full-width bar
- Pre-selects most likely intent based on time of day + patterns
- Swipe left/right cycles intents
- Double-tap confirms and moves focus to Compose

**Section 3 — Compose:**
- 3-5 AI predictions (P1-P5) + common items (C1-C2) + recent selections (R1-R2)
- P1 has visual prominence (amber background tint)
- Focus indicator: 4px teal left border + 102% scale, 150ms spring animation
- Swipe down/up moves focus between items
- Double-tap adds focused item to phrase, fetches next-slot predictions
- Swipe right triggers refinement (similar alternatives)
- Swipe left rejects item
- Single tap opens modifier sub-list
- 2s hold opens context menu

**Section 4 — Phrase:**
- Shows composed phrase in large text (28px semibold)
- Swipe left undoes last word, swipe right redoes
- Swipe down saves phrase
- Double-tap speaks (MVP 1.1)
- 2s hold: "Speak even though not quite right", Save

**Gesture-to-action mapping per section:**

| Gesture | Intent Section | Compose Section | Phrase Section |
|---------|---------------|-----------------|----------------|
| Swipe up | Navigate Home | Focus prev item (or -> Intent) | Focus -> Compose |
| Swipe down | Focus -> Compose | Focus next item (or -> Phrase) | Save phrase |
| Swipe left | Previous intent | Reject focused item | Undo last word |
| Swipe right | Next intent | Refine focused item | Redo last word |
| Tap | Add modifier to intent | Modifier for focused item | — |
| Double-tap | Confirm intent, focus -> Compose | Select item, add to phrase | Speak phrase |
| 2s hold | Context menu | Context menu | Context menu (speak imperfect, save) |

### Common Screen

- Header shows category name (Dates, Names, Medications, Places). NOT added to phrase.
- Items have label + value. Double-tap adds VALUE to phrase.
- Dynamic items auto-populate (e.g., [Today] = current date).
- Swipe left/right on header cycles categories.
- Swipe left/right on items surfaces related items from other categories via Claude.

### Saved Phrases Screen

- Header shows phrase category (Introductions, Daily, Social, Medical, Custom).
- Items are complete phrases.
- Double-tap speaks immediately (MVP 1.1). Pre-1.1: double-tap adds full phrase to phrase bar and shows a visual confirmation — temporary deviation from PRD which assumes TTS is always available.
- Swipe left/right on header cycles categories.
- Swipe left/right on items surfaces related phrases.

---

## 7. Intents

Cold-start curated intents (refined based on aphasia communication research):

| Intent | Purpose |
|--------|---------|
| I need | Core need expression |
| I want | Desire/preference |
| I feel | Emotional/physical state |
| Please | Request to others |
| Where is | Orientation/finding things |
| Don't | Negation/autonomy |
| I love | Emotional connection |
| Thank you | Social phrase |
| Help | Urgent, single word |
| Question | Asking about things — time, people, events |

**Yes/No** may be added as persistent nav bar buttons rather than intents (faster access, no cycling required). Decision deferred to implementation.

Intents are a cold-start scaffold. Over time:
1. Frequency and time-of-day patterns reshape which intents surface first.
2. Metadata-driven intents emerge from usage patterns.
3. Phase 2 (Record flow): Amanda speaks the intent herself, the app detects the stall point, predictions start from there.

---

## 8. Visual Design System

### Color Palette — Light Mode (Default)

| Role | Color | Usage |
|------|-------|-------|
| Background | #F5F5F0 | Screen background |
| Surface | #FFFFFF | Cards, list items |
| Primary accent | #E07B2E | Top prediction highlight, primary actions |
| Focus indicator | #2B7A78 | Focused item border, phrase bar accent |
| Text primary | #1A1A1A | All body text |
| Text secondary | #6B6B6B | Labels (P1, C1), timestamps |
| Destructive | #C0392B | Reject animation |
| Success | #27AE60 | Selection confirmation |
| Disabled/loading | #D5D5D0 | Shimmer placeholder |

### Color Palette — Dark Mode

| Role | Color |
|------|-------|
| Background | #1A1A1A |
| Surface | #2A2A2A |
| Primary accent | #E8952E |
| Focus indicator | #3AAFA9 |
| Text primary | #F5F5F0 |
| Text secondary | #A0A0A0 |

Primary text on all backgrounds exceeds WCAG AAA 7:1 contrast. Secondary text (#6B6B6B on white, #A0A0A0 on dark surface) meets WCAG AA 4.5:1. Secondary text is used only for non-critical labels (P1, C1 prefixes) — never for content Amanda needs to read to make decisions.

### Typography

System font (SF Pro on iOS). Supports Dynamic Type.

| Element | Size | Weight |
|---------|------|--------|
| Intent / category header | 32px | Bold |
| List item text | 24px | Medium |
| Item label (P1, C1) | 14px | Regular |
| Phrase bar | 28px | Semibold |
| Nav bar | 18px | Regular |

### Touch Targets & Spacing

| Element | Min Height |
|---------|-----------|
| List item | 72px |
| Intent / header bar | 80px |
| Phrase bar | 80px |
| Flow cards (Home) | 88px |
| Item gap | 12px |
| Screen padding | 20px |

### Focus Indicator

4px left border in teal + subtle scale-up to 102% with 150ms spring animation. Non-focused items have no left border. Binary contrast — unmistakable.

### Top Prediction (P1)

Amber background (#E07B2E at 15% opacity). Soft ambient signal. Does not interfere with focus indicator.

### Animations

| Animation | Duration | Easing |
|-----------|----------|--------|
| Focus move | 150ms | spring |
| Intent cycle | 200ms | ease-out |
| Item reject | 200ms | ease-in |
| Item refine | 300ms | ease-out |
| Phrase word added | 150ms | spring |
| Phrase undo | 150ms | ease-out |
| Context menu open | 200ms | spring |

All animations respect iOS "Reduce Motion" setting — replaced with simple opacity fades when enabled.

---

## 9. Supabase Backend

### Database Schema

```sql
create table profiles (
  id uuid references auth.users primary key,
  role text default 'user' check (role in ('user', 'admin')),
  display_name text,
  created_at timestamptz default now()
);

create table saved_phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  text text not null,
  category text default 'custom',
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table common_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  label text not null,
  value text not null,
  category text default 'general',
  is_dynamic boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  session_id uuid not null,
  event_type text not null,
  screen text not null,
  intent text,
  item_text text,
  item_type text,
  phrase_so_far text,
  final_phrase text,
  time_of_day text,
  day_of_week text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table session_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  session_id uuid not null,
  intent_selected text,
  intent_cycle_count int,
  steps jsonb,
  final_phrase text,
  outcome text,
  time_intent_to_phrase_ms int,
  time_intent_selection_ms int,
  total_selections int,
  total_rejections int,
  total_refinements int,
  total_undos int,
  prediction_hit_rank jsonb,
  time_of_day text,
  day_of_week text,
  metadata jsonb default '{}',
  started_at timestamptz,
  completed_at timestamptz
);

create table preferences (
  user_id uuid references auth.users primary key,
  elevenlabs_voice_id text,
  speech_rate numeric default 1.0,
  text_scale numeric default 1.0,
  gesture_config jsonb default '{}',
  use_system_tts_only boolean default false,
  theme text default 'light',
  show_fallback_buttons boolean default false,
  updated_at timestamptz default now()
);
```

Extensibility: core columns for fields we query/index. `metadata jsonb` on every table for future fields without migrations.

### Row Level Security

- Amanda sees only her own data across all tables.
- Admin can read everything, write to saved_phrases and common_items.
- usage_events and session_traces are insert-only for Amanda, read-only for admin.
- No anonymous access.

### Edge Functions

**POST /predict** — Claude API proxy
1. Validates JWT
2. Queries Amanda's patterns from usage_events (top selections for intent + time of day)
3. Builds Claude prompt with patterns as context
4. Calls Claude (claude-sonnet-4-20250514, 200 max tokens, 0.7 temp, 2s timeout)
5. Returns predictions array
6. On timeout/error: returns `{ predictions: [], fallback: true }`

**POST /speak** — ElevenLabs proxy (MVP 1.1)
1. Validates JWT
2. Calls ElevenLabs (eleven_flash_v2_5)
3. Streams audio back
4. On error: returns `{ fallback: true }`, client uses system TTS

Pattern queries happen server-side in the Edge Function so prompt engineering can be updated without shipping an app update.

---

## 10. Logging & Pattern Learning

### Level 1: Usage Events

Every gesture that changes state is logged with the UsageEvent schema above. Event types: select, reject, refine, modify, speak, save, abandon.

### Level 2: Session Traces

When a phrase is finalized, the full journey is assembled client-side and written to session_traces:

```typescript
interface SessionTrace {
  session_id: string;
  user_id: string;
  intent_selected: string;
  intent_cycle_count: number;
  steps: SessionStep[];
  final_phrase: string | null;
  outcome: 'spoken' | 'spoken_imperfect' | 'saved' | 'abandoned';
  time_intent_to_phrase_ms: number;
  time_intent_selection_ms: number;
  total_selections: number;
  total_rejections: number;
  total_refinements: number;
  total_undos: number;
  prediction_hit_rank: number[];
  time_of_day: string;
  day_of_week: string;
  started_at: string;
  completed_at: string;
}

interface SessionStep {
  action: 'select' | 'reject' | 'refine' | 'modify' | 'undo' | 'redo' | 'focus_change';
  item_text: string | null;
  item_type: 'prediction' | 'common' | 'recent' | 'saved' | null;
  item_rank: number | null;
  phrase_state: string;
  timestamp_ms: number;
}
```

### What Metrics Unlock

| Metric | Training Signal |
|--------|----------------|
| intent_cycle_count | Are we pre-selecting the right intent? |
| prediction_hit_rank | Are top predictions accurate? |
| total_rejections + item_text | What to stop suggesting |
| total_refinements + item_text | Right neighborhood, wrong specifics |
| total_undos | Selecting too fast or misleading predictions |
| outcome = spoken_imperfect | Couldn't build the right phrase — what was she trying to say? |
| outcome = abandoned | Frustration signal — which intents/times lead to abandonment? |
| time_intent_to_phrase_ms | Overall efficiency trend |
| Full steps array | Exact path teaches refinement patterns |

### How Patterns Feed Predictions

The `/predict` Edge Function includes Amanda's patterns in the Claude prompt:

```
Amanda's session patterns:
- Average composition time: {avg}
- For "{intent}" at {timeOfDay}: P1 hit rate {rate}%, top selections: {items}
- She frequently refines "{item}" -> suggest specific variants
- Recently rejected: {items}
- Abandoned sessions spike at {time} -> predictions may not match needs
```

### Admin Analytics (Next.js web app, MVP 1.2)

- Summary cards: total sessions, avg composition time, completion rate, abandonment rate
- Trend line: composition time over 30 days
- Top predictions by hit rate
- Top rejections
- Refinement patterns
- Time-of-day heatmap
- Recent sessions list with expandable step-by-step traces
- Debug info: recent API calls, errors, latency

---

## 11. Offline Behavior & Error Handling

### Cached Offline (AsyncStorage)

- Saved phrases (synced on app open)
- Common items (synced on app open)
- Curated fallback predictions per intent (bundled)
- Preferences
- Last 20 recent selections

### Requires Connectivity

- Claude predictions (falls back to curated list)
- ElevenLabs TTS (falls back to iOS system voice)
- Event/trace logging (queued locally, synced when online)

### Sync Queue

Offline events stored in AsyncStorage with original timestamps. Queue drains in background when connectivity returns. No training data lost.

### Error Fallback Table

| Failure | Fallback | User Experience |
|---------|----------|-----------------|
| Claude timeout (2s) | Curated fallback predictions | Predictions appear, no error shown |
| Claude error | Curated fallbacks | Silent fallback |
| ElevenLabs timeout/error | iOS system TTS | Different voice, phrase still spoken |
| Supabase auth error | Cached session token | Transparent retry |
| Supabase query error | AsyncStorage cache | Stale but functional |
| No internet | Full offline mode | Subtle "Offline" banner. Everything works. |
| Component crash | ErrorBoundary | "Tap to retry." Phrase bar preserved. Never white screen. |

### Principles

1. Never show an error modal. Amanda doesn't need to know the API timed out.
2. Never lose the phrase. Composition state persisted to AsyncStorage.
3. Queue, don't drop. Events synced later.
4. 2-second timeout on all external calls.

---

## 12. Settings (Mobile App)

Amanda's preferences only. No admin functionality on the phone.

| Setting | Control | Default |
|---------|---------|---------|
| Theme | Light / Dark toggle | Light |
| Text size | Slider (0.8x - 1.5x) | 1.0x |
| Voice | System voice only toggle | Off |
| Speech rate | Slider (0.5x - 1.5x) | 1.0x |
| Gesture sensitivity | Slider (less - more) | Medium |
| Fallback buttons | Show tap alternatives toggle | Off |

---

## 13. MVP Phasing

### MVP 1.0 — Home to Phrase Committed

- Auth: Google Sign-In via Supabase
- Home screen: 4 flow cards (Record = "Coming soon")
- Compose screen: full gesture model, Claude predictions via Edge Function
- Common screen: categories, variable items, shared layout
- Saved Phrases screen: categories, defaults, shared layout
- Shared gesture system (Approach C, fallback path to A)
- Focus state machine + composition state with undo/redo
- Pattern logging (usage events + session traces)
- Curated fallback predictions for offline
- Offline caching + sync queue
- Error boundaries on every screen
- Settings: Amanda's preferences only
- Light/dark mode

### MVP 1.1 — Speech

- ElevenLabs TTS via Edge Function (placeholder voice)
- System TTS fallback
- Double-tap speak on phrase bar and saved phrases
- "Speak even though not quite right" in context menu
- Visual feedback during speech

### MVP 1.2 — Auth & Distribution

- Apple Sign-In
- EAS Build + TestFlight pipeline
- Amanda's cloned voice
- Admin web app (Next.js on Vercel) — analytics only

### Phase 2 — Voice Input

- Record flow: Amanda speaks, app detects stall, completes from there
- Context menu microphone functional

### Phase 3+ — Intelligence

- Adaptive reranking, chunk learning, frustration detection
- Camera analysis, conversation history

---

## 14. Claude API Contract

### Slot Prediction

```typescript
const getSlotPredictions = async (
  intent: string,
  currentPhrase: string[],
  currentSlot: SlotType,
  patterns: PatternContext
): Promise<SlotPrediction[]>
```

**System prompt:**
```
You predict the next word or phrase in a sentence being composed by
Amanda, who has aphasia. She selects an intent, then you predict what
comes next for each slot.

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- 3-5 predictions ranked by likelihood.
- Predictions: 1-4 words. Use natural phrases ("coffee and cream") not
  just single words when a phrase is more natural.
- Consider the intent type for filtering.
- Be warm, direct, practical. Casual speech.
- Weight Amanda's personal patterns heavily — her history matters more
  than general language probability.

JSON:
{"predictions": [{"text": "water", "type": "object"}, ...]}
```

### Refinement (Swipe Right)

Prompt includes original item and asks for 3-5 similar but different alternatives.

### Modifier (Single Tap)

Prompt asks for natural extensions: "and [x]", "with [x]", "without [x]", "but [x]".

### Config

- Model: claude-sonnet-4-20250514
- Max tokens: 200
- Temperature: 0.7
- Timeout: 2000ms

### Curated Fallbacks (Offline)

```typescript
const FALLBACK_PREDICTIONS: Record<string, string[]> = {
  "I need":   ["water", "help", "rest", "medication", "to go outside", "to see someone"],
  "I want":   ["coffee", "to talk", "to go home", "to rest", "something to eat"],
  "Please":   ["help me", "bring water", "call someone", "come here", "wait"],
  "Don't":    ["worry", "go", "forget", "do that", "leave"],
  "Where is": ["my phone", "the bathroom", "my medication", "my daughter", "the remote"],
  "I feel":   ["tired", "good", "frustrated", "hungry", "cold", "happy", "pain"],
  "I love":   ["you", "our daughter", "this", "being here", "our family"],
  "Thank you":["for being here", "for helping", "for your patience", "so much"],
  "Help":     ["me", "please", "I need help", "someone help"],
  "Question": ["what time is it", "who is here", "what day is it", "when is my appointment"],
};
```

---

## 15. PRD Deviations

Intentional divergences from the original PRD (`files/PRD.md`), documented for implementing agents:

| PRD Requirement | Spec Decision | Why |
|----------------|---------------|-----|
| Apple Sign-In + Google Sign-In in MVP | Google only in MVP 1.0; Apple in MVP 1.2 | Apple Developer account pending approval (submitted 2026-03-22) |
| API keys as EXPO_PUBLIC_ env vars | All API keys server-side in Supabase Edge Function secrets | Security: no keys on the device, ever |
| Admin panel in Settings screen | Admin CRUD via Supabase Dashboard; analytics via separate Next.js web app (MVP 1.2) | Amanda's phone should be her space only |
| Settings includes phrase/item editing | Settings is Amanda's preferences only | CRUD moved to admin web/Supabase Dashboard |
| Dark theme (wireframes) | Light mode default, dark mode supported | AAC research: light backgrounds reduce eye strain during extended use |
| Design tokens: intent 20px, list item 20px, phrase 18px | Intent 32px, list item 24px, phrase 28px | AAC best practices: substantially larger type for scanning under cognitive load |
| Touch targets: 56px min | 72-88px min | AAC standard: 80-100px+ for motor impairment users |
| Component structure: compose/, shared/SwipeableItem | gestures/, sections/SectionLayout | Reflects Approach C (shared gesture hook) and shared layout across screens |

---

## 16. Implementation Notes

Answers to technical questions that implementing agents should know:

**Offline event queue:** Max 500 events in AsyncStorage. If the queue fills (extended offline use), oldest events are evicted. Session traces take priority over individual usage events since they contain the richer signal. On reconnection, queue drains in background in chronological order.

**Edge Function pattern query performance:** For the first few months, raw queries against usage_events are fine (small dataset). When events exceed ~10,000 rows, add a `pattern_summaries` materialized view that pre-aggregates top selections by intent + time_of_day. The Edge Function queries the summary first, falls back to raw events. This is a future optimization, not MVP.

**Composition state persistence:** Zustand's `persist` middleware writes to AsyncStorage on every state change. This is debounced (500ms) to avoid write contention. On crash recovery, the last persisted state is restored. Worst case: Amanda loses the last 500ms of composition, which is at most one gesture.

**Navigation model:** The `(tabs)/` directory uses Expo Router's file-based routing but does NOT render a visible tab bar. Home, Compose, Common, and Saved are stack-pushed screens. Amanda navigates via flow cards on Home and swipe-up to return. No persistent tab bar — it would waste screen space and create a confusing second navigation model alongside gestures.

---

## 17. Open Questions

1. Daughter's name? Needed for saved phrases and common items.
2. Medication names? For Common Items.
3. Other common people? Friends, family, medical team names.
4. ElevenLabs placeholder voice ID? Need to select one to start with.
5. Double-tap timing: 300ms default — needs testing with Amanda.
6. Yes/No as persistent nav buttons or as intents? Deferred to implementation.
7. Saved phrase categories — current list (Introductions, Daily, Social, Medical, Custom) correct?
8. Common item categories — current list (Dates, Names, Medications, Places) correct?
