# CLAUDE.md — Dare Vocem

*Latin: "to give voice"*

## What This Is

Amanda Howes has a brain tumor. She has aphasia — she knows what she wants to say but can't get the words out. She can start sentences ("I need...", "How do I...") but struggles to complete them.

Dare Vocem helps her compose and speak complete sentences through a gesture-driven, predictive interface. She navigates intents, predictions, and modifiers through swipes and taps — inspired by the muscle memory of Instagram Reels and dating apps — and the app speaks the composed phrase aloud in her own cloned voice.

The app is both the product and the trainer. Every interaction Amanda has — every selection, every rejection, every refinement — teaches the system what she means and how she speaks. Over time, her most common phrases surface faster and predictions become hers, not generic English.

This is not a general-purpose AAC platform. This is software for Amanda, built by her husband, to keep her in conversation with the people she loves.

## Who Amanda Is

- Full name: Amanda Howes
- DOB: 12/29/1981
- Warm, direct, sometimes funny
- Has a daughter
- Saved self-introduction: "My name is Amanda and I have Aphasia. I can have a hard time finding words but understand what you're saying. Thank you for your patience."
- Common needs: coffee, water, rest, medication, comfort, seeing people, going outside, expressing love, dates, personal info
- **Amanda's aphasia profile (critical — all agents must understand this):**
  - Amanda can say a LOT today. She can finish non-sequiturs and start most sentences. Then she gets stuck mid-sentence and can't find the next word.
  - Her comprehension is fully intact. She knows exactly what she wants to say — the bottleneck is word retrieval and sentence completion, not understanding.
  - **The app doesn't replace Amanda's voice — it finishes what she starts.** This is the core design principle.
  - Today: the Compose flow helps her build sentences via gesture when she can't get the words out.
  - Near-term (Record flow): the app listens to Amanda speak, detects where she stalls, and offers completions from that point forward. This is the highest-impact feature long-term.
  - Long-term: as her condition progresses, she'll rely more on full phrase selection and less on sentence starts. The app must gracefully shift from "sentence completer" to "full phrase speaker" over time.

## Who Maintains This

Her husband. He is technical but this is not his day job. Code must be:
- Clean, well-commented, obvious
- Minimal dependencies — every dep is a future maintenance burden
- Well-structured but not over-engineered

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | Expo (React Native), iOS primary | Amanda has an iPhone. Expo Go for instant testing. |
| Language | TypeScript | Type safety catches bugs before Amanda encounters them. |
| Auth | Supabase Auth (Apple Sign-In + Google Sign-In) | Native Apple auth on iOS. Protects Amanda's private data. |
| Backend | Supabase (Postgres + Row Level Security) | Auth, data persistence, pattern logging, admin access. Generous free tier. Husband can manage via dashboard. |
| AI Prediction | Anthropic Claude API (claude-sonnet-4-20250514) | Contextual slot predictions, refinement, modifier generation. |
| Text-to-Speech | ElevenLabs API (eleven_flash_v2_5) | Amanda's cloned voice. System TTS as offline fallback. |
| State Management | Zustand | Tiny, simple, no boilerplate. |
| Local Cache | AsyncStorage | Offline access to saved phrases, common items, recent patterns. |

### Backend (Supabase)

We need a backend because:
1. **Amanda's data must persist and be protected.** Saved phrases, common items, preferences — all behind auth.
2. **Pattern learning requires storage.** Every selection, rejection, and refinement is logged. Over time this data trains the prediction engine to surface Amanda's ~50 most common phrases.
3. **Admin access for debugging.** Her husband needs to monitor usage, review patterns, add phrases, and troubleshoot — from a separate device if needed.
4. **Future-proofing.** If Amanda gets a new phone, her data comes with her.

#### Supabase Tables

```
profiles                  # Auth-managed, Amanda + admin roles
saved_phrases             # User's saved full phrases
common_items              # Personal data (dates, names, meds)
usage_events              # Every interaction logged for pattern learning
session_traces            # Per-phrase journey (path, metrics, outcome)
preferences               # Voice settings, gesture config, display
```

#### Row Level Security

- Amanda sees only her own data
- Admin account can read all data, write to Amanda's saved_phrases and common_items
- Usage events are insert-only for Amanda, read-only for admin

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
ELEVENLABS_VOICE_ID=               # Amanda's cloned voice ID
```

All Claude and ElevenLabs calls route through Supabase Edge Functions. No API keys on the device, ever.

## Project Structure

See `docs/superpowers/specs/2026-03-23-darevocem-design.md` for the authoritative design spec.

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
    settings.tsx                  # Amanda's preferences only (no admin)
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
- **Gesture thresholds must be tunable.** Swipe distance, double-tap timing, long-press duration — all configurable so we can adjust for Amanda's motor abilities.
- **Log everything.** Every interaction Amanda has is a usage event that feeds pattern learning. This is how the app trains itself.

## Non-Negotiable Requirements

1. **Simple.** Instagram-simple. Swipe, tap, done. No learning curve.
2. **Fast.** Predictions appear in under 2 seconds.
3. **Reliable.** Crashes are unacceptable. Curated phrases always work offline.
4. **Private.** Auth required. Amanda's data is behind RLS. Nobody accesses it without signing in.
5. **Respectful.** Nothing is spoken without Amanda's deliberate double-tap.
6. **Self-training.** Every use makes the app smarter. Pattern learning is not a future phase — it ships day one.
