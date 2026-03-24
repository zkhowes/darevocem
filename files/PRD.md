# PRD.md — Dare Vocem

## Overview

Dare Vocem helps Amanda compose and speak sentences through a gesture-driven, predictive interface. She builds phrases by navigating intents, predictions, and modifiers through swipes and taps, and the app speaks them aloud in her cloned voice.

The app has four main flows accessible from the home screen: Record, Predicted (compose), Common, and Saved. Every interaction is logged to train the system on Amanda's communication patterns from day one.

See CLAUDE.md for project context, tech stack, and coding standards.

---

## Linguistic Model

```
[INTENT] → [OBJECT / ACTION] → [MODIFIER*] → [QUALIFIER*]
```

| Slot | Role | Examples |
|------|------|----------|
| Intent | What kind of utterance | "I need", "I want", "Please", "Don't", "Where is", "I feel" |
| Object/Action | The core thing | "coffee", "help", "bathroom", "mom", "go" |
| Modifier | Refines (zero or many) | "hot", "with cream", "to the store", "quickly" |
| Qualifier | Urgency, emotion, social | "now", "please", "I'm frustrated" |

**Key principles:**
- Intent constrains prediction. "I need" predicts objects/needs. "Please" predicts requests to others.
- Chunks are fused units. "Coffee and cream" surfaces as one item.
- Flexible composition. Slots can be skipped. "Help!" is complete with one word.
- The app learns Amanda's patterns. ~15 phrases cover 50% of daily communication. ~50 phrases cover 80%. The system must learn and surface these fast.

---

## Authentication

### Requirements
- Apple Sign-In and Google Sign-In via Supabase Auth
- Auth screen shown on cold start if no active session
- Two roles: **user** (Amanda) and **admin** (husband)
- Admin role set via Supabase dashboard (not self-assignable)
- Session persists across app restarts
- All data behind Supabase Row Level Security — no anonymous access

### Admin Capabilities
- View Amanda's usage events (selections, rejections, patterns)
- Add/edit/delete saved phrases and common items on Amanda's behalf
- View pattern analytics (most common phrases, time-of-day distributions)
- Debug info: recent API calls, errors, latency

---

## Screens

### Home Screen

The landing page. Four cards leading to the main flows.

```
┌──────────────────────────────────┐
│  ☰                          👤   │
│                                  │
│        D A R E  V O C E M       │
│                                  │
│  ┌──────────────────────────┐    │
│  │  🎙  Record               │    │  ← Start a voice recording session
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │  🔮  Predicted            │    │  ← Compose via intent → predictions
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │  📋  Common               │    │  ← Personal info (dates, names, meds)
│  └──────────────────────────┘    │
│                                  │
│  ┌──────────────────────────┐    │
│  │  💬  Saved                │    │  ← Pre-composed phrases
│  └──────────────────────────┘    │
│                                  │
└──────────────────────────────────┘
```

- **Record:** Opens voice recording flow (Phase 2 — placeholder in MVP that explains "coming soon")
- **Predicted:** Opens the Compose screen with intent selection → AI predictions
- **Common:** Opens Common Items screen
- **Saved:** Opens Saved Phrases screen

---

### Compose Screen (Predicted Flow)

The core interaction screen. **Four distinct sections**, each with independent gesture handling.

```
┌──────────────────────────────────┐
│  ☰                          👤   │  ← SECTION 1: Nav
├──────────────────────────────────┤
│                                  │
│  I1: I need                      │  ← SECTION 2: Intent
│                                  │
├──────────────────────────────────┤
│                                  │
│  ┌──────────────────────────┐    │  ← SECTION 3: Compose
│  │ ▸ P1: coffee             │    │     Focus indicator (▸) shows
│  └──────────────────────────┘    │     which item is active.
│  ┌──────────────────────────┐    │     Orange bg = top prediction.
│  │   P2: help               │    │
│  └──────────────────────────┘    │
│  ┌──────────────────────────┐    │
│  │   C1: name of person     │    │
│  └──────────────────────────┘    │
│  ┌──────────────────────────┐    │
│  │   C2: medication         │    │
│  └──────────────────────────┘    │
│                                  │
├──────────────────────────────────┤
│                                  │
│  Phrase: I need coffee           │  ← SECTION 4: Phrase
│                                  │
└──────────────────────────────────┘
```

#### Section 1: Nav

Standard navigation bar. Hamburger menu (left) for settings/navigation. Profile icon (right) for account.

#### Section 2: Intent

Displays the currently selected intent. Gestures control intent selection and navigation:

| Gesture | Action |
|---------|--------|
| Swipe left | Previous intent (cycles: I need → I want → Please → ...) |
| Swipe right | Next intent (cycles forward) |
| Swipe up | Return to Home screen |
| Swipe down | Move focus into Compose section |
| Single tap | Add modifier to intent: "I need some..." |
| Double tap | Confirm intent, move focus into Compose section |
| 2s hold | Context menu: **Keyboard** (type custom intent), **Camera** (take photo of something), **Microphone** (speak intent), **Save** (save current phrase) |

When the screen first loads, the most likely intent is pre-selected based on time of day and usage patterns. Amanda can cycle through intents with left/right swipes or confirm and move into Compose.

**Intent is added to the phrase.** When Amanda selects "I need", the phrase bar shows "I need".

#### Section 3: Compose

The prediction list. Shows AI-generated predictions, common items, and recent items for the current slot. Focus indicator shows which item is active.

| Gesture | Action |
|---------|--------|
| Swipe down | Move focus to next item (P1 → P2 → C1 → ...). Animation is fast but pronounced. |
| Swipe up | Move focus to previous item. When at top item, move focus back to Intent section. |
| Swipe right | **Refine** — "close but not quite." AI generates similar alternatives. List refreshes. |
| Swipe left | **Reject** — remove focused item from list. Log rejection. Next item takes focus. |
| Single tap | **Modifier** — opens modifier options for focused item: "coffee and...", "coffee with...", "coffee but..." |
| Double tap | **Select** — add focused item to phrase. Advance to next slot predictions or show speak affordance. |
| 2s hold | Context menu: **Keyboard**, **Camera**, **Microphone**, **Save** |

**Item types in the list:**

| Code | Type | Source | Visual |
|------|------|--------|--------|
| P | Prediction | AI-generated via Claude | P1 = orange highlight (top prediction) |
| C | Common | Personal items relevant to context | Standard style |
| R | Recent | From usage pattern history | Standard style |

**Focus model:** One item always has focus, indicated by a visible focus indicator (border, arrow, or highlight animation). Swipe up/down moves focus. All other gestures (tap, double-tap, swipe left/right, hold) act on the focused item.

#### Section 4: Phrase

Displays the composed phrase so far. Grows as Amanda adds slots. Gestures here handle phrase editing and finalization:

| Gesture | Action |
|---------|--------|
| Swipe left | **Undo** — remove last added word/slot. Walk back to previous compose state. For fast mistake correction. |
| Swipe right | **Redo** — re-add last removed word. For fast repositioning. |
| Swipe up | Move focus back into Compose section |
| Swipe down | **Save** — save current phrase to Saved Phrases |
| Double tap | **Speak** — finalize and speak the phrase via TTS |
| 2s hold | Context menu: **"Speak phrase even though not quite right"** (speaks as-is without further composition), **Save** |

---

### Common Screen

Pre-loaded personal information. Models similarly to Compose but with key differences:

- **Intent section** serves as a **category header** (Dates, Names, Medications). Not added to phrase.
- **Compose section** shows items in that category. Items can be either text values or variables.
- **Variable items** (like "[DOB]") display their label but **add the value** to the phrase (e.g., "12/29/1981").
- **Swipe left/right on the Intent/header** cycles through categories.
- **Swipe left/right on Compose items** produces nearby predictions in other elements (related items).

```
┌──────────────────────────────────┐
│  ☰                          👤   │
├──────────────────────────────────┤
│  C1: Dates                       │  ← Category header (not added to phrase)
├──────────────────────────────────┤
│  ┌──────────────────────────┐    │
│  │ ▸ [DOB] 12/29/1981      │    │  ← Variable: label + value
│  └──────────────────────────┘    │     Double-tap adds "12/29/1981" to phrase
│  ┌──────────────────────────┐    │
│  │   [Today] 3/23/2026     │    │  ← Dynamic: auto-populated
│  └──────────────────────────┘    │
│  ┌──────────────────────────┐    │
│  │   [my name] Amanda      │    │
│  │   Howes                  │    │
│  └──────────────────────────┘    │
│  ┌──────────────────────────┐    │
│  │   [thing] medication    │    │
│  └──────────────────────────┘    │
├──────────────────────────────────┤
│  Phrase: 12/29/1981              │
└──────────────────────────────────┘
```

#### Common Screen Gestures

**Header (Category):**
- Swipe left/right → cycle categories (Dates → Names → Medications → ...)
- Swipe up → Home screen
- Swipe down → focus into items

**Items:**
- Same as Compose section gestures, except:
- Swipe left/right → produces nearby/related predictions from other categories
- Double-tap adds the **value** (not the label) to the phrase

**Phrase:**
- Same as Compose screen Phrase section

---

### Saved Phrases Screen

Full pre-composed phrases. Models similarly but with its own differences:

- **Header** shows "Phrases" (or a category like "Introductions", "Daily", "Social"). Not added to phrase.
- **Items** are complete phrases. Double-tap **speaks them immediately** — no further composition.
- **Swipe left/right on header** cycles through saved phrase categories.
- **Swipe left/right on items** surfaces nearby/related phrases.

```
┌──────────────────────────────────┐
│  ☰                          👤   │
├──────────────────────────────────┤
│  S1: Phrases                     │  ← Category header
├──────────────────────────────────┤
│  ┌──────────────────────────┐    │
│  │ ▸ S1: My name is Amanda  │    │  ← Orange = primary
│  │  and I have Aphasia. I   │    │     Double-tap speaks immediately
│  │  can have a hard time    │    │
│  │  finding words...        │    │
│  └──────────────────────────┘    │
│  ┌──────────────────────────┐    │
│  │   S2: My name is Amanda  │    │
│  │   and my daughter is ... │    │
│  └──────────────────────────┘    │
│  ┌──────────────────────────┐    │
│  │   P1: I'm doing well     │    │
│  │   today                  │    │
│  └──────────────────────────┘    │
│  ┌──────────────────────────┐    │
│  │   P2: I need help with   │    │
│  │   something              │    │
│  └──────────────────────────┘    │
├──────────────────────────────────┤
│  Phrase: I need coffee           │  ← Shared phrase bar
└──────────────────────────────────┘
```

---

## Focus Model

Focus determines which section receives gesture input. It flows vertically:

```
Nav (not focusable)
    ↕ (swipe up from Intent → Home)
Intent
    ↕ (swipe down / double-tap → Compose, swipe up → Intent)
Compose
    ↕ (swipe up past top item → Intent, swipe down... see below)
Phrase
    ↕ (swipe up → Compose)
```

Within the Compose section, focus moves between individual items via swipe up/down. The focus indicator (visual highlight, animated border, or arrow) must be **fast but pronounced** so Amanda always knows exactly where she is.

**Focus never moves without a gesture.** The app never auto-advances focus. Amanda is always in control.

---

## Context Menu (2-Second Hold)

Available in Intent, Compose, and Phrase sections. Opens a modal overlay with:

| Option | Icon | Action |
|--------|------|--------|
| Keyboard | ⌨ | Opens text input. Typed text is inserted at current position. |
| Camera | 📷 | Opens camera. Photo is analyzed (Phase 3) or attached for caregiver review. |
| Microphone | 🎙 | Opens voice recording. STT transcribes and inserts result. |
| Save | 💾 | Saves current phrase to Saved Phrases. |

In the **Phrase section**, the context menu instead shows:
- **"Speak even though not quite right"** — speaks phrase as-is
- **Save** — saves current phrase

---

## Pattern Learning (Ships Day 1)

### What Gets Logged

Every interaction Amanda has is a usage event stored in Supabase:

```typescript
interface UsageEvent {
  id: string;
  user_id: string;
  timestamp: string;              // ISO 8601
  event_type: 'select' | 'reject' | 'refine' | 'modify' | 'speak' | 'save' | 'abandon';
  screen: 'compose' | 'common' | 'saved';
  intent: string | null;          // "I need", etc.
  item_text: string | null;       // The item acted on: "coffee"
  item_type: 'prediction' | 'common' | 'recent' | 'saved';
  phrase_so_far: string;          // Phrase at time of event
  final_phrase: string | null;    // Only on 'speak' events
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
  day_of_week: string;
  session_id: string;             // Groups events in one composition session
}
```

### How Patterns Inform Predictions

The Claude API prompt includes Amanda's patterns as context:

```
Amanda's usage patterns:
- When she says "I need" in the morning, she most often means: {top 5 morning "I need" selections}
- Her most common phrases overall: {top 10 by frequency}
- She recently rejected: {last 5 rejections in this session}
- Items she frequently selects: {top 20 across all time}
- Current time: {time_of_day}
```

### Time-of-Day Context (Ships Day 1)

Predictions are weighted by when Amanda typically says things:

```typescript
type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

// Determined by clock:
// morning: 5am - 12pm
// afternoon: 12pm - 5pm
// evening: 5pm - 9pm
// night: 9pm - 5am

// Pattern query: SELECT item_text, COUNT(*) 
// FROM usage_events 
// WHERE intent = ? AND time_of_day = ? AND event_type = 'select'
// GROUP BY item_text ORDER BY count DESC LIMIT 5
```

Morning predictions differ from evening predictions. This is automatic — the system learns from her patterns without manual configuration.

### Cold Start

Before Amanda has built up patterns, the system uses:
1. Curated fallback predictions per intent (see Claude API Contract below)
2. Common items from her profile
3. Claude's general language understanding

After ~1 week of daily use, her own patterns should begin dominating predictions. After ~1 month, the system should feel like it knows her.

---

## App States

```
HOME → COMPOSING → SPEAKING → HOME
           ↕
        REFINING
```

| State | What's Happening |
|-------|-----------------|
| HOME | Home screen with 4 flow cards. |
| COMPOSING | On Compose, Common, or Saved screen. Building/selecting a phrase. |
| REFINING | Swipe-right triggered. Claude generating alternatives. Shimmer/loading on list. |
| SPEAKING | TTS playing the phrase. Phrase bar highlighted. |

### Transitions

```
HOME:
  - Tap "Predicted" → COMPOSING (Compose screen, intent selection)
  - Tap "Common" → COMPOSING (Common screen)
  - Tap "Saved" → COMPOSING (Saved Phrases screen)
  - Tap "Record" → Coming soon placeholder (Phase 2)

COMPOSING:
  - Double-tap item in Compose → item added to phrase, stay COMPOSING
  - Double-tap saved phrase → SPEAKING (immediate)
  - Double-tap on Phrase section → SPEAKING
  - Swipe right on item → REFINING
  - Swipe up from Intent → HOME
  - Hold → Context menu (stays COMPOSING after dismiss)

REFINING:
  - Alternatives received → COMPOSING (list refreshed)
  - API timeout/error → COMPOSING (original list, error toast)

SPEAKING:
  - Audio finishes → HOME. Phrase logged as 'speak' event.
  - Amanda taps screen → Stop audio, HOME.
  - TTS error → Display phrase as large text, copy button. HOME.
```

---

## Phase 1: MVP Scope

### What's IN

1. **Auth** — Apple Sign-In + Google Sign-In via Supabase
2. **Admin role** — read all data, manage Amanda's phrases/items
3. **Home screen** — 4 flow cards (Record as placeholder)
4. **Compose screen** — 4-section layout with full gesture model for Intent, Compose, and Phrase
5. **Common screen** — categories, variable/text items, gesture model
6. **Saved Phrases screen** — categories, double-tap to speak, gesture model
7. **Claude API** — slot prediction, refinement (swipe-right), modifier generation (single-tap)
8. **ElevenLabs TTS** — Amanda's voice with system TTS fallback
9. **Context menu** — keyboard, camera (placeholder), microphone (placeholder), save
10. **Pattern learning** — every interaction logged to Supabase from day 1
11. **Time-of-day context** — predictions weighted by morning/afternoon/evening/night
12. **Focus model** — visual focus indicator with section-to-section navigation
13. **Curated fallbacks** — offline predictions when Claude is unavailable
14. **Settings** — edit saved phrases, edit common items, voice settings, gesture tuning
15. **Error handling** — every failure mode has a fallback

### What's OUT (Phase 2+)

- Voice recording / STT input (Record flow)
- Camera analysis (context menu camera captures but doesn't analyze)
- Microphone in context menu (records but no STT processing)
- Adaptive prediction reranking (patterns logged but not yet feeding back into weighted scoring)
- Frustration detection
- Chunk learning ("coffee and cream" as single item)
- Conversation history view
- Widgets / background operation

### Phase 1 Note on Pattern Learning

Phase 1 **logs all events** and **includes pattern data in Claude prompts**. The pattern-to-prediction pipeline works like this:

1. Amanda uses the app → events logged to Supabase
2. When predictions are requested, the app queries recent patterns from Supabase
3. Top patterns for this intent + time of day are injected into the Claude system prompt
4. Claude uses Amanda's patterns as context alongside its language model

This is not a local ML model. It's Claude receiving Amanda's history as prompt context. Simple, effective, and training starts from the very first interaction.

---

## Acceptance Criteria

### AC-1: Authentication

- [ ] Cold start shows sign-in screen if no active session
- [ ] Apple Sign-In and Google Sign-In both functional
- [ ] Session persists across app restarts
- [ ] All Supabase queries enforce RLS — no data accessible without auth
- [ ] Admin role can view usage events and manage Amanda's data in Settings

### AC-2: Home Screen

- [ ] Shows 4 flow cards: Record, Predicted, Common, Saved
- [ ] Record card shows "Coming soon" state (tappable but leads to placeholder)
- [ ] Other 3 cards navigate to their respective screens
- [ ] Navigation back from any screen returns to Home

### AC-3: Compose Screen — Intent Section

- [ ] Most likely intent pre-selected based on time of day and patterns
- [ ] Swipe left/right cycles through available intents
- [ ] Swipe up returns to Home screen
- [ ] Swipe down or double-tap moves focus into Compose section
- [ ] Single tap adds modifier to intent text
- [ ] 2s hold opens context menu (keyboard, camera, mic, save)
- [ ] Selected intent is added to the phrase bar

### AC-4: Compose Screen — Compose Section

- [ ] Claude API returns 3-5 ranked predictions within 2 seconds of intent selection
- [ ] Top prediction has orange highlight
- [ ] Common items and recent items fill remaining list slots
- [ ] Focus indicator visible on active item, moves with swipe up/down
- [ ] Swipe up/down animations are fast but pronounced
- [ ] Swipe up from top item moves focus to Intent section
- [ ] Swipe right on focused item triggers refinement API call (similar alternatives)
- [ ] Swipe left on focused item removes it, logs rejection
- [ ] Single tap opens modifier sub-list for focused item
- [ ] Double-tap adds focused item to phrase, advances to next slot or shows speak affordance
- [ ] 2s hold opens context menu

### AC-5: Compose Screen — Phrase Section

- [ ] Displays composed phrase, updates with each selection
- [ ] Swipe left removes last added word (undo), walks back compose state
- [ ] Swipe right re-adds last removed word (redo)
- [ ] Swipe up moves focus to Compose section
- [ ] Swipe down saves current phrase to Saved Phrases
- [ ] Double-tap speaks phrase via TTS
- [ ] 2s hold shows context menu: "Speak even though not quite right", Save

### AC-6: Common Screen

- [ ] Header shows category name (not added to phrase)
- [ ] Swipe left/right on header cycles categories
- [ ] Variable items display label but add value to phrase (e.g., "[DOB]" adds "12/29/1981")
- [ ] Dynamic items auto-populate (today's date)
- [ ] Swipe left/right on items surfaces related items from other categories
- [ ] Phrase section gestures work identically to Compose screen

### AC-7: Saved Phrases Screen

- [ ] Header shows phrase category
- [ ] Swipe left/right on header cycles categories
- [ ] Double-tap on a saved phrase speaks it immediately
- [ ] Swipe left/right on items surfaces nearby/related phrases
- [ ] Default phrases pre-populated (aphasia intro, daughter intro, "doing well", "need help")
- [ ] Phrases editable in Settings

### AC-8: Text-to-Speech

- [ ] ElevenLabs API speaks using Amanda's cloned voice ID
- [ ] Uses `eleven_flash_v2_5` model
- [ ] Audio plays through device speaker
- [ ] Fallback to iOS system TTS if ElevenLabs fails
- [ ] Visual indication while speaking (phrase bar highlight, speaker animation)
- [ ] Tap during speech stops playback

### AC-9: Pattern Learning

- [ ] Every select, reject, refine, modify, speak, save, and abandon event logged to Supabase
- [ ] Events include: intent, item, phrase state, time of day, day of week, session ID
- [ ] Pattern data queried and included in Claude API prompts
- [ ] Time-of-day bucketing works correctly (morning/afternoon/evening/night)
- [ ] Admin can view usage events in Settings

### AC-10: Reliability

- [ ] App never crashes. Error boundaries on every screen.
- [ ] All API calls (Claude, ElevenLabs, Supabase) have 2-second timeout
- [ ] No internet → Saved Phrases and Common Items work with system TTS
- [ ] No internet → Compose screen shows curated fallback predictions
- [ ] App cold-starts to auth check → Home in under 3 seconds
- [ ] All local state persists across restarts via AsyncStorage cache

---

## Claude API Contract

### Slot Prediction

```typescript
const getSlotPredictions = async (
  intent: string,
  currentPhrase: string[],
  currentSlot: SlotType,
  patterns: PatternContext        // Amanda's usage patterns
): Promise<SlotPrediction[]>
```

**System Prompt:**
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

**User Message:**
```
Intent: "{intent}"
Phrase so far: "{currentPhrase.join(' ')}"
Predict the next {currentSlot}.

Amanda's patterns:
- Time of day: {timeOfDay}
- Top selections for "{intent}" at this time: {topPatterns}
- Recent session: {recentSelections}
- Recently rejected: {recentRejections}
```

### Refinement (Swipe Right)

**User Message:**
```
Intent: "{intent}"
Phrase so far: "{currentPhrase.join(' ')}"
She saw "{originalItem}" and indicated it's close but not right.
Suggest 3-5 similar but different alternatives.
```

### Modifier (Single Tap)

**User Message:**
```
Intent: "{intent}"
Phrase so far: "{currentPhrase.join(' ')}"
She wants to extend "{targetItem}" with a modifier.
Suggest natural extensions: "and [x]", "with [x]", "without [x]", "but [x]".
```

### Shared Config

- **Model:** `claude-sonnet-4-20250514`
- **Max tokens:** 200
- **Temperature:** 0.7
- **Timeout:** 2000ms

### Curated Fallbacks (Offline)

```typescript
const FALLBACK_PREDICTIONS: Record<string, string[]> = {
  "I need":   ["water", "help", "rest", "medication", "to go outside", "to see someone"],
  "I want":   ["coffee", "to talk", "to go home", "to rest", "something to eat"],
  "Please":   ["help me", "bring water", "call someone", "come here", "wait"],
  "Don't":    ["worry", "go", "forget", "do that", "leave"],
  "Where is": ["my phone", "the bathroom", "my medication", "my daughter", "the remote"],
  "I feel":   ["tired", "good", "frustrated", "hungry", "cold", "happy", "pain"],
  "Question": ["what time is it", "who is here", "what day is it", "when is my appointment"],
};
```

---

## ElevenLabs TTS Contract

```typescript
interface TTSService {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
}

// POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
// Model: eleven_flash_v2_5
// Fallback: expo-speech (iOS system TTS)
```

---

## Supabase Schema

```sql
-- Users managed by Supabase Auth
-- Admin role stored in user metadata or profiles table

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
  label text not null,                    -- "[DOB]", "[Today]", "[my name]"
  value text not null,                    -- "12/29/1981", "Amanda Howes"
  category text default 'general',        -- "dates", "names", "medications"
  is_dynamic boolean default false,       -- true for auto-populated values
  sort_order int default 0,
  created_at timestamptz default now()
);

create table usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  session_id uuid not null,
  event_type text not null,               -- select, reject, refine, modify, speak, save, abandon
  screen text not null,                   -- compose, common, saved
  intent text,
  item_text text,
  item_type text,                         -- prediction, common, recent, saved
  phrase_so_far text,
  final_phrase text,
  time_of_day text,                       -- morning, afternoon, evening, night
  day_of_week text,
  created_at timestamptz default now()
);

create table preferences (
  user_id uuid references auth.users primary key,
  elevenlabs_voice_id text,
  speech_rate numeric default 1.0,
  text_scale numeric default 1.0,
  gesture_config jsonb default '{}',
  use_system_tts_only boolean default false,
  updated_at timestamptz default now()
);

-- RLS policies
alter table saved_phrases enable row level security;
alter table common_items enable row level security;
alter table usage_events enable row level security;
alter table preferences enable row level security;

-- User sees own data
create policy "Users see own saved_phrases" on saved_phrases
  for all using (auth.uid() = user_id);

create policy "Users see own common_items" on common_items
  for all using (auth.uid() = user_id);

create policy "Users insert own usage_events" on usage_events
  for insert with check (auth.uid() = user_id);

create policy "Users see own preferences" on preferences
  for all using (auth.uid() = user_id);

-- Admin sees all data (check role in profiles)
create policy "Admin reads all saved_phrases" on saved_phrases
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admin manages all saved_phrases" on saved_phrases
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Repeat admin policies for common_items, usage_events, preferences
```

---

## Visual Design

### Colors (from wireframes)

- **Background:** Dark (#1a1a1a)
- **Card/item default:** Dark gray (#2a2a2a)
- **Top prediction highlight:** Orange/amber (#E8952E)
- **Phrase bar:** Dark with teal accent border
- **Focus indicator:** Bright, animated — unmistakable
- **Text on dark:** White
- **Text on orange:** White
- **Section separators:** Subtle divider lines

### Design Tokens

```typescript
const DESIGN = {
  minTouchTarget: 56,
  fontSize: {
    intent: 20,
    listItem: 20,
    phraseBar: 18,
    itemLabel: 14,        // P1, C1, S1 labels
  },
  spacing: {
    itemGap: 8,
    sectionPadding: 16,
    screenPadding: 20,
  },
  timing: {
    apiTimeoutMs: 2000,
    focusAnimationMs: 150,    // Fast but pronounced
    cardSlideMs: 200,
    longPressMs: 2000,
    doubleTapMaxDelayMs: 300,
    swipeThresholdPx: 50,
  },
};
```

---

## Phase 2: Voice Recording Flow

- Record card on Home leads to voice recording screen
- Press-and-hold mic button to record
- STT transcribes Amanda's partial speech
- System identifies intent and partial slots from transcript
- Pre-fills the Compose screen with recognized content
- Amanda corrects/completes using existing gesture model
- Context menu microphone option becomes functional

## Phase 3: Intelligence

- Camera analysis in context menu (describe photo, use as context)
- Adaptive reranking: prediction order adjusts based on accumulated patterns without Claude
- Chunk learning: frequent combos surface as single items
- Frustration detection: high rejection rate → broader categories
- Sequence patterns: "water" → 20 min later → "bathroom"
- Conversation history view

## Phase 4: Polish

- Offline AI: cached predictions for top intents
- Pre-generated ElevenLabs audio for saved phrases
- Caregiver notification (admin alerted if Amanda abandons sessions)
- Battery optimization
- Haptic feedback
- Accessibility audit (Dynamic Type, VoiceOver)
- iPad layout
- Widgets for saved phrases

---

## Open Questions

1. **Daughter's name?** Needed for saved phrases.
2. **Medication names?** For Common Items.
3. **Other common people?** Friends, family, medical team names for Common.
4. **Which ElevenLabs voice ID?** Use preset voice until Amanda's clone is ready.
5. **Double-tap timing:** 300ms default — need to test with Amanda. Too fast? Too slow?
6. **Portrait only?** Recommend yes for Phase 1.
7. **What categories for Saved Phrases?** Suggestions: Introductions, Daily, Social, Medical, Custom.
8. **What categories for Common Items?** Suggestions: Dates, Names, Medications, Places.
