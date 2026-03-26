# Dare Vocem -- Authoritative Spec

*Latin: "to give voice"*

**Last updated:** 2026-03-25
**Status:** Active

---

## 1. Purpose

Dare Vocem is an AAC app for a user with aphasia caused by a brain tumor. The user knows what they want to say but can't get the words out. They can start most sentences and finish non-sequiturs, then get stuck mid-sentence.

The app helps the user compose and speak complete sentences through a gesture-driven, predictive interface. They navigate intents, predictions, and modifiers through swipes and taps, and the app speaks the composed phrase aloud in a cloned voice.

**The app doesn't replace the user's voice -- it finishes what they start.**

This is not a general-purpose AAC platform. This is purpose-built software to keep the user in conversation with the people they love.

### Privacy

Never reference the user by name in code, comments, prompts, or documentation. The user is always "the user." Personal details are stored in the user's profile and loaded dynamically at runtime -- never hardcoded.

---

## 2. Aphasia Profile

- The user can say a LOT today. They can finish non-sequiturs and start most sentences. Then they get stuck mid-sentence and can't find the next word.
- Comprehension is fully intact. The bottleneck is word retrieval and sentence completion, not understanding.
- Common needs: coffee, water, rest, medication, comfort, seeing people, going outside, expressing love, dates, personal info.
- Today: the Compose flow helps them build sentences via gesture when they can't get the words out.
- Near-term (Record flow): the app listens to the user speak, detects where they stall, and offers completions from that point forward.
- Long-term: as the condition progresses, they'll rely more on full phrase selection and less on sentence starts. The app must gracefully shift from "sentence completer" to "full phrase speaker" over time.

---

## 3. Linguistic Model

```
[INTENT] -> [OBJECT / ACTION] -> [MODIFIER*] -> [QUALIFIER*]
```

| Slot | Role | Examples |
|------|------|----------|
| Intent | What kind of utterance | "I need", "I want", "Please", "Don't", "Where is", "I feel" |
| Object/Action | The core thing | "coffee", "help", "bathroom", "mom", "go" |
| Modifier | Refines (zero or many) | "hot", "with cream", "to the store", "quickly" |
| Qualifier | Urgency, emotion, social | "now", "please", "I'm frustrated" |

Key principles:
- Intent constrains prediction. "I need" predicts objects/needs. "Please" predicts requests.
- Chunks are fused units. "Coffee and cream" surfaces as one item.
- Flexible composition. Slots can be skipped. "Help!" is complete with one word.
- The app learns the user's patterns. ~15 phrases cover 50% of daily communication. ~50 phrases cover 80%. The system must learn and surface these fast.

---

## 4. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Expo SDK 52 (React Native), iOS primary | The user has an iPhone. Expo Go for rapid iteration, dev builds for native features. |
| Language | TypeScript | Type safety catches bugs before the user encounters them. |
| Auth | Supabase Auth (Google Sign-In now, Apple Sign-In later) | Native auth on iOS. Protects the user's private data. |
| Backend | Supabase (Postgres + RLS + Edge Functions) | Auth, database, RLS, and API proxies in one. No separate server. |
| API Proxy | Supabase Edge Functions | Claude and ElevenLabs API keys stay server-side. No keys on the device, ever. |
| AI Prediction | Anthropic Claude API (claude-sonnet-4-20250514) via Edge Function | Contextual slot predictions, refinement, modifier generation. |
| Text-to-Speech | ElevenLabs API (eleven_flash_v2_5) via Edge Function | User's cloned voice (placeholder voice until clone ready). System TTS as offline fallback. |
| State Management | Zustand | Tiny, simple, no boilerplate. |
| Local Cache | AsyncStorage | Offline access to saved phrases, common items, recent patterns. |

### Development and Distribution

- **Dev testing:** Expo Go initially, graduating to dev builds when Apple Sign-In and audio streaming are needed.
- **Distribution:** EAS Build -> TestFlight -> user's phone. Push to `main` triggers build.
- **Admin (MVP 1.0-1.1):** Supabase Dashboard for CRUD (phrases, common items) and raw data viewing. No custom admin UI.
- **Admin (MVP 1.2):** Lightweight Next.js web app on Vercel for session analytics and pattern visualization.

### Security Principles

- No API keys on the device, ever. All external API calls route through Supabase Edge Functions.
- All data behind Supabase Row Level Security. No anonymous access.
- Auth required on cold start.

---

## 5. Authentication

- Google Sign-In via Supabase Auth in MVP. Apple Sign-In added later (developer account pending).
- Auth screen shown on cold start if no active session.
- Two roles: **user** and **admin** (husband).
- Admin role set via Supabase dashboard (not self-assignable).
- Session persists across app restarts.
- All data behind Supabase RLS -- no anonymous access.

### Onboarding Flow

After first sign-in, onboarding collects: name, date of birth, phone, address. This data seeds both `saved_phrases` (e.g., introductory phrases with the user's name) and `common_items` (e.g., DOB as a date item).

### Admin Capabilities

- View usage events (selections, rejections, patterns)
- Add/edit/delete saved phrases and common items on behalf of the user
- View pattern analytics (most common phrases, time-of-day distributions)
- Debug info: recent API calls, errors, latency

---

## 6. Navigation

Stack navigation with gesture-based flow. **No tab bar.** Home, Compose, Common, and Saved are stack-pushed screens. The user navigates via starter cards on Home and swipe-up to return. No persistent tab bar -- it would waste screen space and create a confusing second navigation model alongside gestures.

Hamburger menu (top-left) on all screens for settings/navigation. Profile icon (top-right) for account.

---

## 7. Screens

### 7.1 Home Screen

A unified feed of color-coded starter cards in a `WheelPicker` component. All card types are mixed together and scrollable.

**Card types and colors:**
- **Predicted** (orange, `#E07B2E` fill): Time-aware intents -- "I need", "I want", "I feel", etc. Ordered by time-of-day relevance.
- **Common** (teal, `#2B7A78` fill): Dynamic items from `common_items` table -- today's date, names, medications.
- **Saved** (purple, `#7B68AE` fill): Full saved phrases from `saved_phrases` table.

**Layout:**
- "DARE VOCEM" title at top
- Hamburger menu (top-left)
- **Keyboard/Record card** below nav, above WheelPicker:
  - Default state shows "Record" label with mic icon and "Tap for keyboard" hint
  - Tap toggles to keyboard mode: text input with "Go" button
  - Keyboard submit starts compose with typed text as the intent
  - **Record (mic) is a placeholder** — will be implemented when speech-to-text integration is ready
- `WheelPicker` fills remaining screen area
- Initial focus lands on top time-relevant predicted intent

**Data passed to compose:** Route params: `{ type: 'prediction' | 'common' | 'saved', value: string, intent?: string }`

#### Home Screen Gestures

| Gesture | Action |
|---------|--------|
| Swipe up/down | Scroll through cards, focus follows center |
| Single tap | Cycle modifier on focused card (see Section 9) |
| Double tap | Select card, navigate to compose with context pre-loaded |
| Left/right swipe | No-op on home screen |
| Long press | Context menu: Keyboard, Camera (placeholder), Microphone (placeholder), Save |

### 7.2 Compose Screen (Predicted Flow)

Three sections: Intent (collapsed header), Compose (WheelPicker), Phrase bar.

#### Intent Section

Collapsed by default when compose loads. Shows actual intent from the composition store (supports custom typed text, not just curated intents). Swipe up or tap to expand and change intent.

When compose loads from a predicted card on Home, the intent is already set and predictions are pre-fetched. No confirmation step required.

#### Compose Section (WheelPicker)

Shows 3-5 AI predictions (P1-P5) + common items (C1-C2) + recent selections (R1-R2). P1 has visual prominence (amber background tint).

**Predictions must be natural continuations of the phrase so far.** The edge function uses context-aware slot typing -- each prediction extends the phrase grammatically, not just topically.

| Gesture | Action |
|---------|--------|
| Swipe up/down | Scroll predictions, focus follows center |
| Right swipe | **Refine** -- generate similar alternatives for focused item. List refreshes with alternatives. |
| Left swipe | **Reject** -- remove focused item from list. Log rejection. Next item takes focus. |
| Single tap | **Cycle modifier** on focused item: "coffee" -> "coffee and" -> "coffee or" -> "coffee with" (see Section 9) |
| Double tap | **Select** -- add focused item to phrase + fetch next-slot predictions |
| Long press | Context menu: Keyboard, Camera (placeholder), Microphone (placeholder), Save |

#### Phrase Section

Displays the composed phrase. Grows as the user adds slots. Lower swipe threshold (30px) for the small target area.

| Gesture | Action |
|---------|--------|
| Swipe left | **Undo** -- remove last added word/slot |
| Swipe right | **Redo** -- re-add last removed word |
| Swipe up | Move focus back to Compose section |
| Swipe down | **Save** current phrase to Saved Phrases |
| Double tap | **Speak** -- finalize and speak the phrase via TTS |
| Long press | Context menu: "Speak even though not quite right" (speaks as-is), Save |

#### Compose Entry Behavior by Card Type

- **Predicted intent** (e.g., "I need"): Intent set in phrase bar, predictions pre-fetched, ComposeSection focused on first prediction.
- **Common item** (e.g., "March 24"): Item added as first slot, predictions loaded for what comes next.
- **Saved phrase** (e.g., "My name is..."): Full phrase loaded in phrase bar, focus on PhraseSection for immediate speak/modify.

### 7.3 Common Screen

Same shared section layout (header, items, phrase bar). Key differences:

- **Header** shows category name (Dates, Names, Medications, Places). NOT added to phrase.
- **Items** have label + value. Double-tap adds the VALUE to phrase (e.g., "[DOB]" adds "12/29/1981").
- **Dynamic items** auto-populate (e.g., [Today] = current date).
- Swipe left/right on header cycles categories.
- Swipe left/right on items surfaces related items from other categories via Claude.
- Phrase section gestures identical to Compose screen.

### 7.4 Saved Phrases Screen

Same shared section layout. Key differences:

- **Header** shows phrase category (Introductions, Daily, Social, Medical, Custom).
- **Items** are complete phrases.
- **Double-tap speaks immediately** -- no further composition.
- Swipe left/right on header cycles categories.
- Swipe left/right on items surfaces related phrases.

---

## 8. Focus Model

Focus determines which section receives gesture input. It flows vertically:

```
Intent (collapsed bar, rarely active -- only when expanded)
    |
Compose (default focus on entry)
    |
Phrase
```

Within the Compose section, the WheelPicker manages focus -- whichever item lands in the center slot is focused.

**Focus never moves without a gesture.** The user is always in control.

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
- `compose` + swipe down past last item -> `phrase`
- `compose` + swipe up past first item -> `intent`
- `phrase` + swipe up -> `compose` (restores previous composeIndex)
- `intent` + swipe up -> navigate Home

---

## 9. Single Tap Modifier Cycling

Tap cycles through ranked modifiers on the focused item.

1. **First tap**: Fetches modifiers from prediction service. Appends top modifier. Display: "coffee and"
2. **Subsequent taps**: Cycles to next modifier. "coffee or" -> "coffee with" -> "coffee but"
3. **After last modifier**: Loops back to first ("coffee and")
4. **Left swipe**: Clears modifier, back to "coffee"
5. **Focus change**: Clears modifier state

Works on both ComposeSection predictions and Home screen cards. Home intents use contextual connectors ("I need" -> "I need to" -> "I need a") rather than conjunctions.

### Modifier State

```typescript
modifierState: {
  targetItem: string;        // "coffee"
  modifiers: string[];       // ["and", "or", "with", "but", "then"]
  currentIndex: number;
} | null;
```

Fallback defaults: `["and", "or", "with", "but", "then", "not"]`

---

## 10. Context Menu (Long Press)

Available in Intent, Compose, and Phrase sections. Opens a modal overlay.

| Option | Action |
|--------|--------|
| Keyboard | Opens text input. Typed text inserted at current position. |
| Camera | Opens camera (placeholder in MVP). |
| Microphone | Opens voice recording (placeholder in MVP). |
| Save | Saves current phrase to Saved Phrases. |

In the **Phrase section**, the context menu shows:
- **"Speak even though not quite right"** -- speaks phrase as-is
- **Save** -- saves current phrase

---

## 11. WheelPicker Component

Shared scrollable list with one unmistakably focused item. Used on Home and Compose screens.

### Focused Item (center slot)
- Height: ~120px
- Font: 32px bold
- Colored background fill (depends on item type)
- White text on colored background
- Positioned in vertical center of available area

### Non-focused Items
- Height: 72px
- Font: 22px
- White/light background with colored left border
- Full opacity -- fully readable, not faded

### Scrolling Behavior

Swipe up/down scrolls the list. Whichever item lands in the center slot becomes focused -- grows to 120px with colored fill. Previous focused item shrinks to 72px. Smooth spring animation.

### Component API

```typescript
interface WheelPickerProps {
  items: WheelPickerItem[];
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onGesture: (gesture: GestureType, item: WheelPickerItem) => void;
  renderItem: (item: WheelPickerItem, isFocused: boolean) => ReactNode;
}

interface WheelPickerItem {
  id: string;
  text: string;
  itemType: 'prediction' | 'common' | 'saved';
  color: string;
  metadata?: Record<string, unknown>;
}
```

---

## 12. Gesture Map (Complete)

### Home Screen (WheelPicker)

| Gesture | Action |
|---------|--------|
| Swipe up/down | Scroll cards, focus follows center |
| Single tap | Cycle modifier on focused card |
| Double tap | Select card, navigate to compose |
| Left/right swipe | No-op |
| Long press | Context menu |

### Compose Screen -- Intent Section (collapsed bar)

| Gesture | Action |
|---------|--------|
| Swipe up | Expand to full intent selector |
| Tap | Expand to full intent selector |

### Compose Screen -- Compose Section (WheelPicker)

| Gesture | Action |
|---------|--------|
| Swipe up/down | Scroll predictions, focus follows center |
| Right swipe | Refine focused item (similar alternatives) |
| Left swipe | Reject focused item (remove from list) |
| Single tap | Cycle modifier on focused item |
| Double tap | Select item, add to phrase, fetch next predictions |
| Long press | Context menu |

### Compose Screen -- Phrase Section (30px swipe threshold)

| Gesture | Action |
|---------|--------|
| Swipe left | Undo last slot |
| Swipe right | Redo last undo |
| Swipe up | Focus -> Compose section |
| Swipe down | Save phrase |
| Double tap | Speak phrase |
| Long press | Context menu (speak imperfect, save) |

### Common Screen -- Header

| Gesture | Action |
|---------|--------|
| Swipe left/right | Cycle categories |
| Swipe up | Home screen |
| Swipe down | Focus into items |

### Common/Saved Screen -- Items

| Gesture | Action |
|---------|--------|
| Swipe up/down | Move focus between items |
| Swipe left/right | Surface related items/phrases |
| Double tap | Add value to phrase (Common) / Speak immediately (Saved) |
| Long press | Context menu |

### Common/Saved Screen -- Phrase Section

Same as Compose Screen Phrase Section.

---

## 13. Visual Design System

### Color Palette -- Light Mode (Default)

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
| Saved card | #7B68AE | Saved phrase card fill |

### Color Palette -- Dark Mode

| Role | Color |
|------|-------|
| Background | #1A1A1A |
| Surface | #2A2A2A |
| Primary accent | #E8952E |
| Focus indicator | #3AAFA9 |
| Text primary | #F5F5F0 |
| Text secondary | #A0A0A0 |

Light mode is the default. Primary text exceeds WCAG AAA 7:1 contrast on all backgrounds. Secondary text meets WCAG AA 4.5:1 and is used only for non-critical labels.

### Typography

System font (SF Pro on iOS). Supports Dynamic Type.

| Element | Size | Weight |
|---------|------|--------|
| Intent / category header | 32px | Bold |
| WheelPicker focused item | 32px | Bold |
| WheelPicker non-focused item | 22px | Medium |
| List item text | 24px | Medium |
| Item label (P1, C1) | 14px | Regular |
| Phrase bar | 28px | Semibold |
| Nav bar | 18px | Regular |

### Touch Targets and Spacing

| Element | Min Height |
|---------|-----------|
| WheelPicker focused item | 120px |
| WheelPicker non-focused item | 72px |
| Intent / header bar | 80px |
| Phrase bar | 80px |
| Flow cards (Home) | 88px |
| Item gap | 12px |
| Screen padding | 20px |

### Focus Indicator

WheelPicker handles focus styling directly: focused item grows to 120px with colored fill. Non-focused items are 72px with white/light background. The transition uses a 150ms spring animation. Binary contrast -- unmistakable.

### Animations

| Animation | Duration | Easing |
|-----------|----------|--------|
| Focus move / WheelPicker scroll | 150ms | spring |
| Intent cycle | 200ms | ease-out |
| Item reject | 200ms | ease-in |
| Item refine | 300ms | ease-out |
| Phrase word added | 150ms | spring |
| Phrase undo | 150ms | ease-out |
| Context menu open | 200ms | spring |

All animations respect iOS "Reduce Motion" setting -- replaced with simple opacity fades when enabled.

### Design Tokens

```typescript
const DESIGN = {
  minTouchTarget: 72,
  fontSize: {
    intent: 32,
    listItem: 24,
    phraseBar: 28,
    itemLabel: 14,
    wheelFocused: 32,
    wheelUnfocused: 22,
  },
  spacing: {
    itemGap: 12,
    sectionPadding: 16,
    screenPadding: 20,
  },
  timing: {
    apiTimeoutMs: 2000,
    focusAnimationMs: 150,
    cardSlideMs: 200,
    longPressMs: 2000,
    doubleTapMaxDelayMs: 300,
    swipeThresholdPx: 50,
    phraseSwipeThresholdPx: 30,
  },
};
```

---

## 14. Intents

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
| Question | Asking about things -- time, people, events |

**Yes/No** may be added as persistent nav bar buttons rather than intents. Decision deferred.

Intents are a cold-start scaffold. Over time:
1. Frequency and time-of-day patterns reshape which intents surface first.
2. Custom typed intents are supported (via keyboard in context menu or long-press).
3. Phase 2 (Record flow): the user speaks the intent, the app detects the stall point, predictions start from there.

---

## 15. Pattern Learning

Ships day one. Every interaction teaches the system.

### Level 1: Usage Events

Every gesture that changes state is logged:

```typescript
interface UsageEvent {
  id: string;
  user_id: string;
  session_id: string;
  event_type: 'select' | 'reject' | 'refine' | 'modify' | 'speak' | 'save' | 'abandon';
  screen: 'compose' | 'common' | 'saved';
  intent: string | null;
  item_text: string | null;
  item_type: 'prediction' | 'common' | 'recent' | 'saved';
  phrase_so_far: string;
  final_phrase: string | null;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
  day_of_week: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
```

### Level 2: Session Traces

When a phrase is finalized, the full journey is assembled client-side:

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

### Time-of-Day Context

```typescript
type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
// morning: 5am-12pm, afternoon: 12pm-5pm, evening: 5pm-9pm, night: 9pm-5am
```

Predictions are weighted by when the user typically says things. Morning predictions differ from evening predictions. Automatic -- the system learns from patterns without manual configuration.

### How Patterns Feed Predictions

The `/predict` Edge Function queries patterns server-side and includes them in the Claude prompt:

```
User's session patterns:
- Average composition time: {avg}
- For "{intent}" at {timeOfDay}: P1 hit rate {rate}%, top selections: {items}
- Frequently refined: "{item}" -> suggest specific variants
- Recently rejected: {items}
- Abandoned sessions spike at {time} -> predictions may not match needs
```

### What Metrics Unlock

| Metric | Training Signal |
|--------|----------------|
| intent_cycle_count | Are we pre-selecting the right intent? |
| prediction_hit_rank | Are top predictions accurate? |
| total_rejections + item_text | What to stop suggesting |
| total_refinements + item_text | Right neighborhood, wrong specifics |
| total_undos | Selecting too fast or misleading predictions |
| outcome = spoken_imperfect | Couldn't build the right phrase |
| outcome = abandoned | Frustration signal |
| time_intent_to_phrase_ms | Overall efficiency trend |

### Cold Start

Before patterns are built up:
1. Curated fallback predictions per intent
2. Common items from onboarding profile
3. Claude's general language understanding

After ~1 week of daily use, the user's own patterns begin dominating. After ~1 month, the system should feel like it knows them.

---

## 16. Supabase Schema

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

### Row Level Security

```sql
alter table saved_phrases enable row level security;
alter table common_items enable row level security;
alter table usage_events enable row level security;
alter table session_traces enable row level security;
alter table preferences enable row level security;

-- User sees own data
create policy "Users see own saved_phrases" on saved_phrases
  for all using (auth.uid() = user_id);

create policy "Users see own common_items" on common_items
  for all using (auth.uid() = user_id);

create policy "Users insert own usage_events" on usage_events
  for insert with check (auth.uid() = user_id);

create policy "Users see own session_traces" on session_traces
  for all using (auth.uid() = user_id);

create policy "Users see own preferences" on preferences
  for all using (auth.uid() = user_id);

-- Admin sees and manages all data
create policy "Admin manages all saved_phrases" on saved_phrases
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin manages all common_items" on common_items
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin reads all usage_events" on usage_events
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin reads all session_traces" on session_traces
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin manages all preferences" on preferences
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
```

---

## 17. Edge Function API Contracts

### POST /predict -- Slot Prediction

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
a user who has aphasia. They select an intent, then you predict what
comes next for each slot.

Rules:
- Return ONLY valid JSON. No markdown, no explanation.
- 3-5 predictions ranked by likelihood.
- Predictions must be natural continuations of the phrase so far.
  Each prediction should extend the sentence grammatically.
- Predictions: 1-4 words. Use natural phrases ("coffee and cream")
  not just single words when a phrase is more natural.
- Consider the intent type for filtering.
- Be warm, direct, practical. Casual speech.
- Weight the user's personal patterns heavily -- their history
  matters more than general language probability.

JSON:
{"predictions": [{"text": "water", "type": "object"}, ...]}
```

**User message:**
```
Intent: "{intent}"
Phrase so far: "{currentPhrase.join(' ')}"
Predict the next {currentSlot}.

User's patterns:
- Time of day: {timeOfDay}
- Top selections for "{intent}" at this time: {topPatterns}
- Recent session: {recentSelections}
- Recently rejected: {recentRejections}
```

### POST /predict -- Refinement (right swipe)

**User message:**
```
Intent: "{intent}"
Phrase so far: "{currentPhrase.join(' ')}"
They saw "{originalItem}" and indicated it's close but not right.
Suggest 3-5 similar but different alternatives.
```

### POST /predict -- Modifier (single tap)

**User message:**
```
Intent: "{intent}"
Phrase so far: "{currentPhrase.join(' ')}"
They want to extend "{targetItem}" with a modifier.
Suggest natural extensions: "and [x]", "with [x]", "without [x]", "but [x]".
```

### Edge Function Internals

1. Validates JWT
2. Queries user's patterns from usage_events (top selections for intent + time of day)
3. Builds Claude prompt with patterns as context
4. Calls Claude (claude-sonnet-4-20250514, 200 max tokens, 0.7 temp, 2s timeout)
5. Returns predictions array
6. On timeout/error: returns `{ predictions: [], fallback: true }`

Pattern queries happen server-side so prompt engineering can be updated without shipping an app update.

### POST /speak -- ElevenLabs Proxy

```typescript
interface TTSService {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}
```

1. Validates JWT
2. Calls ElevenLabs (eleven_flash_v2_5, user's voice ID from preferences)
3. Streams audio back
4. On error: returns `{ fallback: true }`, client uses system TTS

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

const FALLBACK_MODIFIERS: string[] = ["and", "or", "with", "but", "then", "not"];
```

---

## 18. App States

```
HOME -> COMPOSING -> SPEAKING -> HOME
            |
         REFINING
```

| State | What's Happening |
|-------|-----------------|
| HOME | Home screen with WheelPicker starter cards. |
| COMPOSING | On Compose, Common, or Saved screen. Building/selecting a phrase. |
| REFINING | Right-swipe triggered. Claude generating alternatives. Shimmer/loading on list. |
| SPEAKING | TTS playing the phrase. Phrase bar highlighted. |

### Transitions

```
HOME:
  - Double-tap predicted card -> COMPOSING (Compose screen, intent pre-loaded)
  - Double-tap common card -> COMPOSING (Compose screen, item pre-loaded)
  - Double-tap saved card -> COMPOSING (Compose screen, phrase pre-loaded)

COMPOSING:
  - Double-tap item in Compose -> item added to phrase, stay COMPOSING
  - Double-tap saved phrase -> SPEAKING (immediate)
  - Double-tap on Phrase section -> SPEAKING
  - Right swipe on item -> REFINING
  - Swipe up from Intent -> HOME
  - Long press -> Context menu (stays COMPOSING after dismiss)

REFINING:
  - Alternatives received -> COMPOSING (list refreshed)
  - API timeout/error -> COMPOSING (original list, error toast)

SPEAKING:
  - Audio finishes -> HOME. Phrase logged as 'speak' event.
  - User taps screen -> Stop audio, HOME.
  - TTS error -> Display phrase as large text, copy button. HOME.
```

---

## 19. Offline Behavior and Error Handling

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

Offline events stored in AsyncStorage with original timestamps. Queue drains in background when connectivity returns. Max 500 events; oldest evicted if full. Session traces take priority over individual usage events. No training data lost.

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

1. Never show an error modal. The user doesn't need to know the API timed out.
2. Never lose the phrase. Composition state persisted to AsyncStorage (debounced 500ms).
3. Queue, don't drop. Events synced later.
4. 2-second timeout on all external calls.

---

## 20. Project Structure

```
darevocem/
  app/
    _layout.tsx                     # Root layout, auth guard, error boundary
    login.tsx                       # Google Sign-In (Apple Sign-In later)
    (app)/
      _layout.tsx                   # Stack navigator (no tab bar)
      index.tsx                     # Home -- WheelPicker with mixed starter cards
      compose.tsx                   # Compose screen (accepts route params, pre-loads)
      common.tsx                    # Common items screen
      saved.tsx                     # Saved phrases screen
      settings.tsx                  # User's preferences only (no admin)
  components/
    gestures/
      useGesture.ts                 # Shared gesture interpreter hook
      GestureArea.tsx               # Wrapper that applies useGesture to a view
      FallbackButtons.tsx           # Tap-based alternatives (WCAG 2.5.1)
    sections/
      SectionLayout.tsx             # Shared section layout for Compose/Common/Saved
      IntentSection.tsx             # Header for Compose: collapsed by default, expandable
      ComposeSection.tsx            # WheelPicker with predictions
      PhraseSection.tsx             # Phrase bar: undo/redo/speak
      CategoryHeader.tsx            # Header for Common/Saved: category cycling
    shared/
      WheelPicker.tsx               # Shared scrollable focused-item picker
      ContextMenu.tsx               # Long-press menu: keyboard, camera, mic, save
      SpeakButton.tsx               # Trigger TTS
      ErrorBoundary.tsx             # Catches crashes, shows fallback UI
      OfflineBanner.tsx             # Connectivity status indicator
    home/
      StarterCard.tsx               # WheelPicker item renderer for home screen
  services/
    supabase.ts                     # Supabase client + auth helpers
    predictions.ts                  # Calls Edge Function /predict (+ getModifiers)
    tts.ts                          # Calls Edge Function /speak + system TTS fallback
    context.ts                      # Time-of-day, session context
    patterns.ts                     # Read/write usage patterns from Supabase
    offline.ts                      # AsyncStorage cache layer + sync queue
  stores/
    auth.ts                         # Auth state
    focus.ts                        # Focus state machine (section + composeIndex)
    composition.ts                  # Phrase composition, undo/redo, modifier state, pre-fetch
    preferences.ts                  # Settings (synced to Supabase)
  types/
    index.ts                        # Shared TypeScript types
  constants/
    config.ts                       # Gesture thresholds, timing, design tokens
    intents.ts                      # Curated intent definitions
    fallbacks.ts                    # Offline fallback predictions + modifier fallbacks
  supabase/
    functions/
      predict/index.ts              # Edge Function: Claude API proxy (predict + refine + modify)
      speak/index.ts                # Edge Function: ElevenLabs API proxy
    migrations/
      001_initial_schema.sql        # Tables, RLS policies
```

---

## 21. Settings (Mobile App)

User's preferences only. No admin functionality on the phone.

| Setting | Control | Default |
|---------|---------|---------|
| Theme | Light / Dark toggle | Light |
| Text size | Slider (0.8x - 1.5x) | 1.0x |
| Voice | System voice only toggle | Off |
| Speech rate | Slider (0.5x - 1.5x) | 1.0x |
| Gesture sensitivity | Slider (less - more) | Medium |
| Fallback buttons | Show tap alternatives toggle | Off |

---

## 22. MVP Phasing

### MVP 1.0 -- Home to Phrase Committed

- Auth: Google Sign-In via Supabase
- Onboarding: collect name, DOB, phone, address; seed saved_phrases and common_items
- Home screen: WheelPicker with mixed starter cards (predicted/common/saved), hamburger menu
- Compose screen: WheelPicker, collapsed intent bar, pre-loading from home, full gesture model
- Common screen: categories, variable items, shared layout
- Saved Phrases screen: categories, defaults, shared layout
- Shared gesture system with WheelPicker
- Focus state machine + composition state with undo/redo
- Modifier cycling (single tap)
- Pattern logging (usage events + session traces)
- Curated fallback predictions for offline
- Offline caching + sync queue
- Error boundaries on every screen
- Settings: user's preferences only
- Light mode default, dark mode supported

### MVP 1.1 -- Speech

- ElevenLabs TTS via Edge Function (placeholder voice)
- System TTS fallback
- Double-tap speak on phrase bar and saved phrases
- "Speak even though not quite right" in context menu
- Visual feedback during speech

### MVP 1.2 -- Auth and Distribution

- Apple Sign-In
- EAS Build + TestFlight pipeline
- User's cloned voice
- Admin web app (Next.js on Vercel) -- analytics only

### Phase 2 -- Voice Input

- Record flow: user speaks, app detects stall, completes from there
- Context menu microphone becomes functional

### Phase 3+ -- Intelligence

- Adaptive reranking, chunk learning, frustration detection
- Camera analysis, conversation history
- Sequence patterns ("water" -> 20 min later -> "bathroom")

### Phase 4 -- Polish

- Offline AI: cached predictions for top intents
- Pre-generated ElevenLabs audio for saved phrases
- Caregiver notification on abandoned sessions
- Battery optimization, haptic feedback
- Accessibility audit (Dynamic Type, VoiceOver)
- iPad layout, widgets

---

## 23. Acceptance Criteria

### AC-1: Authentication
- [ ] Cold start shows sign-in screen if no active session
- [ ] Google Sign-In functional
- [ ] Onboarding collects name, DOB, phone, address and seeds saved_phrases + common_items
- [ ] Session persists across app restarts
- [ ] All Supabase queries enforce RLS -- no data accessible without auth
- [ ] Admin role can view usage events and manage data in Supabase Dashboard

### AC-2: Home Screen
- [ ] WheelPicker displays mixed starter cards (predicted/common/saved)
- [ ] Cards color-coded by type (orange/teal/purple)
- [ ] Predicted cards ordered by time-of-day relevance
- [ ] Hamburger menu accessible
- [ ] Double-tap navigates to compose with context pre-loaded
- [ ] Single tap cycles modifiers on focused card

### AC-3: Compose Screen -- Intent Section
- [ ] Collapsed by default showing current intent from store
- [ ] Supports custom typed text (not just curated intents)
- [ ] Tap or swipe up expands to full intent selector
- [ ] When expanded: swipe left/right cycles intents, double-tap confirms

### AC-4: Compose Screen -- Compose Section
- [ ] WheelPicker with focused item at center (120px, colored fill)
- [ ] Claude API returns 3-5 ranked predictions within 2 seconds
- [ ] Predictions are natural continuations of the phrase so far
- [ ] Top prediction has orange/amber highlight
- [ ] Common items and recent items fill remaining list slots
- [ ] Right swipe triggers refinement (similar alternatives)
- [ ] Left swipe rejects item and removes from list
- [ ] Single tap cycles modifiers ("coffee" -> "coffee and" -> "coffee or")
- [ ] Double tap adds item to phrase and fetches next-slot predictions
- [ ] Long press opens context menu

### AC-5: Compose Screen -- Phrase Section
- [ ] Displays composed phrase, updates with each selection
- [ ] Swipe left undoes last word (30px threshold)
- [ ] Swipe right redoes last undo (30px threshold)
- [ ] Swipe up moves focus to Compose section
- [ ] Swipe down saves phrase
- [ ] Double tap speaks phrase via TTS
- [ ] Long press shows context menu: "Speak even though not quite right", Save

### AC-6: Common Screen
- [ ] Header shows category name (not added to phrase)
- [ ] Swipe left/right on header cycles categories
- [ ] Variable items display label but add value to phrase
- [ ] Dynamic items auto-populate (today's date)
- [ ] Swipe left/right on items surfaces related items
- [ ] Phrase section gestures identical to Compose

### AC-7: Saved Phrases Screen
- [ ] Header shows phrase category
- [ ] Swipe left/right on header cycles categories
- [ ] Double-tap on a saved phrase speaks it immediately
- [ ] Swipe left/right on items surfaces related phrases
- [ ] Default phrases pre-populated from onboarding
- [ ] Phrases editable via admin (Supabase Dashboard)

### AC-8: Text-to-Speech
- [ ] ElevenLabs API speaks using user's voice ID from preferences
- [ ] Uses eleven_flash_v2_5 model
- [ ] Audio plays through device speaker
- [ ] Fallback to iOS system TTS if ElevenLabs fails
- [ ] Visual indication while speaking
- [ ] Tap during speech stops playback

### AC-9: Pattern Learning
- [ ] Every select, reject, refine, modify, speak, save, and abandon event logged
- [ ] Events include: intent, item, phrase state, time of day, day of week, session ID
- [ ] Session traces capture full journey with metrics
- [ ] Pattern data queried server-side and included in Claude prompts
- [ ] Time-of-day bucketing works correctly

### AC-10: Reliability
- [ ] App never crashes. Error boundaries on every screen.
- [ ] All API calls have 2-second timeout
- [ ] No internet: Saved Phrases and Common Items work with system TTS
- [ ] No internet: Compose screen shows curated fallback predictions
- [ ] App cold-starts to auth check -> Home in under 3 seconds
- [ ] All local state persists across restarts via AsyncStorage cache

---

## 24. Open Questions

1. Daughter's name? Needed for saved phrases and common items.
2. Medication names? For Common Items.
3. Other common people? Friends, family, medical team names.
4. ElevenLabs placeholder voice ID? Need to select one to start with.
5. Double-tap timing: 300ms default -- needs testing with the user.
6. Yes/No as persistent nav buttons or as intents? Deferred.
7. Saved phrase categories -- current list (Introductions, Daily, Social, Medical, Custom) correct?
8. Common item categories -- current list (Dates, Names, Medications, Places) correct?
