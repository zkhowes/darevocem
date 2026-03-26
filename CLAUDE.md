# CLAUDE.md — Dare Vocem

*Latin: "to give voice"*

## What This Is

Dare Vocem is an AAC (Augmentative and Alternative Communication) app for a user with aphasia caused by a brain tumor. The user knows what they want to say but can't get the words out. They can start sentences ("I need...", "How do I...") but struggle to complete them.

Dare Vocem helps the user compose and speak complete sentences through a gesture-driven, predictive interface. They navigate intents, predictions, and modifiers through swipes and taps — inspired by the muscle memory of Instagram Reels and dating apps — and the app speaks the composed phrase aloud in a cloned voice.

The app is both the product and the trainer. Every interaction — every selection, every rejection, every refinement — teaches the system what the user means and how they speak. Over time, their most common phrases surface faster and predictions become theirs, not generic English.

This is not a general-purpose AAC platform. This is purpose-built software to keep the user in conversation with the people they love.

## Privacy

**IMPORTANT: Never reference the user by name in code, comments, prompts, or documentation.** The user is always referred to as "the user" or "user". Personal details (name, DOB, address, etc.) are stored in the user's profile and loaded dynamically at runtime — never hardcoded.

## User's Aphasia Profile

All agents working on this project must understand this:
- The user can say a LOT today. They can finish non-sequiturs and start most sentences. Then they get stuck mid-sentence and can't find the next word.
- Their comprehension is fully intact. They know exactly what they want to say — the bottleneck is word retrieval and sentence completion, not understanding.
- **The app doesn't replace the user's voice — it finishes what they start.** This is the core design principle.
- Common needs: coffee, water, rest, medication, comfort, seeing people, going outside, expressing love, dates, personal info
- Today: the Compose flow helps them build sentences via gesture when they can't get the words out.
- Near-term (Record flow): the app listens to the user speak, detects where they stall, and offers completions from that point forward. This is the highest-impact feature long-term.
- Long-term: as their condition progresses, they'll rely more on full phrase selection and less on sentence starts. The app must gracefully shift from "sentence completer" to "full phrase speaker" over time.

## Who Maintains This

The developer. He is technical but this is not his day job. Code must be:
- Clean, well-commented, obvious
- Minimal dependencies — every dep is a future maintenance burden
- Well-structured but not over-engineered

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Expo (React Native), iOS primary | The user has an iPhone. Expo Go for instant testing. |
| Language | TypeScript | Type safety catches bugs before the user encounters them. |
| Auth | Supabase Auth (Apple Sign-In + Google Sign-In) | Native Apple auth on iOS. Protects the user's private data. |
| Backend | Supabase (Postgres + Row Level Security) | Auth, data persistence, pattern logging, admin access. Generous free tier. Husband can manage via dashboard. |
| AI Prediction | Anthropic Claude API (claude-haiku-4-5-20251001) | Contextual slot predictions, refinement, modifier generation. Cost-effective and fast for constrained completion tasks. |
| Text-to-Speech | ElevenLabs API (eleven_flash_v2_5) | User's cloned voice. System TTS as offline fallback. |
| State Management | Zustand | Tiny, simple, no boilerplate. |
| Local Cache | AsyncStorage | Offline access to saved phrases, common items, recent patterns. |

### Backend (Supabase)

We need a backend because:
1. **User data must persist and be protected.** Saved phrases, common items, preferences — all behind auth.
2. **Pattern learning requires storage.** Every selection, rejection, and refinement is logged. Over time this data trains the prediction engine to surface the user's ~50 most common phrases.
3. **Admin access for debugging.** Her husband needs to monitor usage, review patterns, add phrases, and troubleshoot — from a separate device if needed.
4. **Future-proofing.** If the user gets a new phone, their data comes with them.

#### Supabase Tables

```
profiles                  # Auth-managed, user + admin roles
saved_phrases             # User's saved full phrases
common_items              # Personal data (dates, names, meds)
usage_events              # Every interaction logged for pattern learning
session_traces            # Per-phrase journey (path, metrics, outcome)
preferences               # Voice settings, gesture config, display
```

#### Row Level Security

- Users see only their own data
- Admin account can read all data, write to user's saved_phrases and common_items
- Usage events are insert-only for users, read-only for admin

## Environment Variables

**Client-side (EXPO_PUBLIC_ prefix — bundled into app):**
```
EXPO_PUBLIC_SUPABASE_URL=          # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key (RLS enforced)
```

**Server-side (Supabase Edge Function secrets — NEVER on device):**
```
ANTHROPIC_API_KEY=                 # Claude API for predictions
ELEVENLABS_API_KEY=                # ElevenLabs for voice output
ELEVENLABS_VOICE_ID=               # the user's cloned voice ID
```

All Claude and ElevenLabs calls route through Supabase Edge Functions. No API keys on the device, ever.

## Project Structure

See `docs/SPEC.md` for the authoritative design spec (merged from PRD, design spec, and UX redesign).

```
app/
  _layout.tsx                     # Root layout, auth guard, error boundary
  login.tsx                       # Google Sign-In (Apple Sign-In MVP 1.2)
  (app)/
    _layout.tsx                   # Stack navigator (no tab bar)
    index.tsx                     # Home — 4 flow cards
    compose.tsx                   # Compose screen (Predicted flow)
    common.tsx                    # Common items screen
    saved.tsx                     # Saved phrases screen
    settings.tsx                  # the user's preferences only (no admin)
components/
  gestures/
    useGesture.ts                 # Shared gesture interpreter hook (Approach C)
    GestureArea.tsx               # Wrapper that applies useGesture to a view
    FallbackButtons.tsx           # Tap-based alternatives for accessibility (WCAG 2.5.1)
  sections/
    SectionLayout.tsx             # Shared 4-section layout for Compose/Common/Saved
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
  predictions.ts                  # Calls Supabase Edge Function /predict
  tts.ts                          # Calls Edge Function /speak + system TTS fallback
  context.ts                      # Time-of-day, session context
  patterns.ts                     # Read/write usage patterns from Supabase
  offline.ts                      # AsyncStorage cache layer + sync queue
stores/
  auth.ts                         # Zustand — auth state
  focus.ts                        # Zustand — focus state machine
  composition.ts                  # Zustand — phrase composition + undo/redo
  preferences.ts                  # Zustand — settings (synced to Supabase)
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

## Coding Standards

- **No class components.** Functional components + hooks only.
- **No `any` types.** Type everything.
- **Error boundaries everywhere.** The app must never crash or show a white screen.
- **Every API call has a timeout and fallback.** Claude down? Curated defaults. ElevenLabs down? System voice. Supabase down? Local cache.
- **No magic numbers.** All gesture thresholds, timing values, and design tokens are named constants in `constants/config.ts`.
- **Comments explain WHY, not what.**
- **Gesture thresholds must be tunable.** Swipe distance, double-tap timing, long-press duration — all configurable so we can adjust for the user's motor abilities.
- **Log everything.** Every interaction the user has is a usage event that feeds pattern learning. This is how the app trains itself.

## Prediction Architecture — Hard-Won Lessons

These rules exist because we spent a full day debugging bad predictions. Do not deviate.

1. **Send the FULL phrase to Claude, not fragments.** The edge function receives `fullPhrase` (e.g., "I need coffee") — never a separate intent + slots. Claude must see the complete sentence being built to predict what comes next naturally.

2. **Swipe-left refines the FOCUSED item only.** When the user swipes left on "coffee", only "coffee" is recorded as tried (`recordTriedItem`). The other predictions on screen represent different paths the user hasn't explored — do NOT mark them as rejected. The old `triedPaths` (array of full prediction lists) was poisoning every subsequent request.

3. **Clear tried items on selection.** When the user double-taps to select a word, `triedItems` resets. New word = fresh prediction space.

4. **Never blank the prediction list.** `refine()` and `setPredictions()` must guard against empty arrays. If the edge function returns nothing, keep the current predictions visible. The user must always have options.

5. **Fallbacks must never filter to empty.** `getFallbacks()` returns the unfiltered list if filtering against triedItems removes all options.

6. **The edge function has a 4-second budget.** Auth + DB query + Claude call = 3 serial network hops. 2 seconds was too aggressive and caused constant fallbacks.

7. **The refine prompt must know what's visible.** Send `otherVisibleOptions` (predictions currently on screen) so Claude doesn't suggest duplicates. Send `triedItems` (individually rejected words) so it avoids those too.

8. **Use the PredictionDebug overlay.** In dev mode, tap "DBG" on the compose screen to see every prediction request/response: full phrase, tried items, results, latency, source (claude vs fallback). Don't debug predictions blind.

## Non-Negotiable Requirements

1. **Simple.** Instagram-simple. Swipe, tap, done. No learning curve.
2. **Fast.** Predictions appear in under 2 seconds.
3. **Reliable.** Crashes are unacceptable. Curated phrases always work offline.
4. **Private.** Auth required. User data is behind RLS. Nobody accesses it without signing in.
5. **Respectful.** Nothing is spoken without the user's deliberate double-tap.
6. **Self-training.** Every use makes the app smarter. Pattern learning is not a future phase — it ships day one.
