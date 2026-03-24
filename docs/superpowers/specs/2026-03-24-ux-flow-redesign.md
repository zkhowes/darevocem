# Dare Vocem UX Flow Redesign

**Date**: 2026-03-24
**Status**: Draft
**Approach**: Evolutionary refactor (Approach A) — rework internals of existing screens, keep distinct screen identity

## Problem

The current flow has too many steps between launch and composing a phrase. The home screen is a passive selector. The compose screen requires double-tap to confirm intent before predictions load. Focus styling is too subtle. Left swipe rejects items instead of navigating prediction history. Single tap modifiers aren't wired up.

## Design Summary

Five changes to reduce friction and make the interaction more fluid:

1. **Home screen** becomes a unified launchpad with color-coded starter cards
2. **Compose screen** pre-loads with context from home — no intent confirmation step
3. **WheelPicker component** replaces flat lists with a clear focused-item pattern
4. **Left/right swipe** navigates a prediction history tree instead of reject/refine
5. **Single tap** cycles through ranked modifiers on the focused item

---

## 1. Home Screen Redesign

### Current
4 static `FlowCard`s (Record, Predicted, Common, Saved) — tap to navigate to separate screens.

### New
A unified feed of color-coded starter cards in a `WheelPicker` component. All card types are mixed together and scrollable.

### Card Types and Colors
- **Predicted** (orange, `#E07B2E` fill): Time-aware intents from `constants/intents.ts` — "I need", "I want", "I feel", etc. Ordered by time-of-day relevance.
- **Common** (teal, `#2B7A78` fill): Dynamic items from `common_items` table — today's date, names, medications. `[Today]` resolves at render time.
- **Saved** (purple, `#7B68AE` fill): Full saved phrases from `saved_phrases` table — "My name is Amanda. I have aphasia."

### Layout
- "DARE VOCEM" title at top (unchanged)
- `WheelPicker` fills remaining screen area
- Initial focus lands on top time-relevant predicted intent

### Interaction
- **Swipe up/down**: Scroll through cards, focus follows center position
- **Single tap**: Cycle modifier on focused card (see Section 5)
- **Double tap**: Select card, navigate to compose with context pre-loaded
- **Left/right swipe**: No-op on home screen (no prediction history to navigate here)

### Note on Record Flow
The current "Record" FlowCard is removed from the home screen in this redesign. Record is the highest-impact future feature (listening to Amanda speak and completing her sentences) but is not part of the gesture-based compose flow. It will be re-introduced as a dedicated entry point (e.g., a persistent mic button or a top-level mode toggle) when the Record flow is implemented.

### Data Passed to Compose
Route params: `{ type: 'prediction' | 'common' | 'saved', value: string, intent?: string }`

### Files Changed
- `app/(app)/index.tsx` — replace FlowCard grid with WheelPicker
- `components/home/FlowCard.tsx` — remove (replaced by WheelPicker item renderer)
- New: `components/shared/WheelPicker.tsx`
- New: `components/home/StarterCard.tsx` — item renderer for home WheelPicker

---

## 2. Compose Screen Pre-loading

### Current
Opens with IntentSection focused. User must cycle intents, double-tap or swipe-down to confirm, then predictions load.

### New
Compose opens with context already active based on what was tapped on home. No confirmation step.

### Entry Behavior by Card Type
- **Predicted intent** (e.g., "I need"): Intent set in phrase bar, predictions already fetched, ComposeSection focused on first prediction via WheelPicker
- **Common item** (e.g., "March 24"): Item added as first slot, predictions loaded for what comes next
- **Saved phrase** (e.g., "My name is Amanda..."): Full phrase loaded in phrase bar, focus on PhraseSection for immediate speak/modify

### IntentSection
Minimized to a small bar at the top showing current intent. Swipe up to expand and change intent if needed. Not the default focus.

### Saved Phrase Entry
When a saved phrase is selected, it does not decompose into intent + slots. Instead:
- `intent` is set to `null`
- `slots` is set to `[fullPhraseText]` (single slot containing the entire phrase)
- `getPhrase()` returns just the phrase text (no intent prefix)
- Focus lands on PhraseSection for immediate speak or modify

### Prediction Pre-fetching
When a card is tapped on home, `getPredictions()` is called immediately (before navigation animation completes). Results stored in composition store via `preload()` method. Compose screen reads from store on mount.

**Pre-fetch timing:**
- If pre-fetch completes before compose mounts: predictions render immediately, no spinner.
- If pre-fetch is still in-flight when compose mounts: show shimmer loading state (existing behavior in ComposeSection). Predictions appear when ready.
- If pre-fetch fails: fall back to curated defaults from `constants/fallbacks.ts` (existing fallback behavior).
- The `isLoading` flag in composition store is set to `true` during pre-fetch and `false` on completion/failure.

### Mount Behavior Change
The current `compose.tsx` calls `reset()` on mount, which wipes all state. This must be replaced with a conditional: if the store already has pre-loaded state (intent set, predictions present), skip the reset. Only reset if compose is entered without pre-loaded context (e.g., deep link or direct navigation).

### Files Changed
- `app/(app)/compose.tsx` — accept route params, skip intent confirmation, conditional mount reset, read pre-fetched predictions
- `components/sections/IntentSection.tsx` — add collapsed/minimized mode
- `components/sections/ComposeSection.tsx` — replace FlatList with WheelPicker
- `stores/composition.ts` — support pre-loading intent + predictions before navigation

---

## 3. WheelPicker Component

### Current
Flat list with subtle `FocusIndicator` (1.02 scale, 4px teal left border). Items are 72px tall, uniform styling. Currently rendering gray boxes.

### New
`WheelPicker` — a scrollable list with one unmistakably focused item. Used on both home and compose screens.

### Focused Item (center slot)
- Height: ~120px
- Font: 32px bold
- Colored background fill (color depends on item type)
- White text on colored background
- Positioned in vertical center of available area
- Subtle shadow/elevation

### All Other Items
- Height: 72px
- Font: 22px
- White/light background with colored left border or text to indicate type
- Full opacity — fully readable, not blurred or faded
- Sit above and below focused item in scrollable list

### Scrolling Behavior
As user swipes up/down, the list scrolls. Whichever item lands in the center slot becomes focused — grows to 120px with colored fill. Previous focused item shrinks back to 72px. Smooth spring animation.

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
  itemType: 'prediction' | 'common' | 'saved';  // aligns with existing ItemType in types/index.ts ('recent' excluded — merged into 'prediction')
  color: string;         // fill color when focused
  metadata?: Record<string, unknown>;
}
```

### Reuse
- Home screen: starter cards (predicted/common/saved)
- Compose screen: predictions
- Potentially common/saved screens in future

### Files Changed
- New: `components/shared/WheelPicker.tsx`
- `components/shared/FocusIndicator.tsx` — may be deprecated or simplified (WheelPicker handles its own focus styling)

---

## 4. Prediction Navigation (Left/Right Swipe)

### Current
- Right swipe: refine (not implemented, Task 10)
- Left swipe: reject (filters item from predictions)

### New
Prediction history stack with branching and full path logging.

### Right Swipe — "continue this direction"
1. Adds focused item to the phrase (same as current double-tap select)
2. Pushes current prediction list onto `predictionHistory` stack
3. Fetches next predictions continuing down this path
4. Logged: `{ action: 'advance', item: 'coffee', path: ['I need', 'coffee'] }`

### Left Swipe — "go back / try different"
1. If `predictionHistory` has entries: pops previous prediction list, removes last slot from phrase
2. If history is empty: fetches divergent predictions — service call includes full history of tried/rejected paths so Claude suggests genuinely different directions
3. Logged: `{ action: 'backtrack', from: 'coffee', historyDepth: 2 }` or `{ action: 'diverge', triedPaths: [...] }`

### Path Logging
Every right/left swipe builds a tree in session events. Full path-to-success plus dead ends captured for pattern learning.

### Example Flow
1. "I need" → right swipe "water" → right swipe "cold" → phrase: "I need water cold"
2. Left swipe → back to [water, help, rest...], phrase: "I need water"
3. Left swipe → back to [water, help, rest...], phrase: "I need"
4. Left swipe → history empty → diverge → [to go outside, a hug, Emma...]

### State Addition to Composition Store
```typescript
predictionHistory: {
  predictions: ComposeItem[];
  slot: string;              // what was selected to advance
}[];
triedPaths: string[][];       // paths that were fully backed out of
```

### Relationship to Undo/Redo
The existing `undoSlot()`/`redoSlot()` in the PhraseSection and the new `predictionHistory` backtrack in ComposeSection are **separate mechanisms for separate contexts**:

- **PhraseSection left/right swipe** (undo/redo): Operates on the slots array only. Does NOT modify prediction history. Use case: Amanda wants to remove a word from the phrase bar without changing what predictions are showing.
- **ComposeSection left swipe** (backtrack): Pops prediction history AND removes the corresponding slot. Use case: Amanda wants to go back to the previous set of predictions.

They can coexist because they're triggered from different sections. If Amanda undoes a slot via PhraseSection, the prediction history becomes stale (the last history entry references a slot that's no longer present). This is acceptable — when she swipes back to ComposeSection, the predictions shown are still valid options. If she then right-swipes to advance again, a new history entry is pushed and the stale one is naturally overwritten.

### Files Changed
- `stores/composition.ts` — add `predictionHistory`, `triedPaths`, advance/backtrack/diverge methods
- `services/predictions.ts` — update `getPredictions()` to accept `triedPaths` for divergent requests
- `components/sections/ComposeSection.tsx` — wire left/right swipe to new store methods
- `supabase/functions/predict/index.ts` — update Claude prompt to handle divergent path requests

---

## 5. Single Tap Modifier Cycling

### Current
Single tap mapped to "modify" in gesture system but not wired up (Task 15 placeholder).

### New
Tap cycles through ranked modifiers on the focused item.

### Behavior
1. **First tap**: Fetches modifiers from prediction service ranked by probability. Appends top modifier. Display: "coffee and"
2. **Subsequent taps**: Cycles to next modifier. "coffee or" → "coffee with" → "coffee but"
3. **After last modifier**: Loops back to first ("coffee and")
4. **Left swipe**: Clears modifier, back to "coffee"
5. **Right swipe**: Commits item + modifier, advances to next predictions
6. **Focus change**: Clears modifier state

### Where It Works
- **ComposeSection predictions**: "coffee" → tap → "coffee and" → tap → "coffee or" (primary use case)
- **Home screen intents**: Modifier cycling is available for consistency, but intents use contextual connectors rather than conjunctions. For example: "I need" → tap → "I need to" → tap → "I need a". The modifier list for intents comes from the prediction service, which returns grammatically appropriate continuations, not the generic fallback list.

### State Addition to Composition Store
```typescript
modifierState: {
  targetItem: string;        // "coffee"
  modifiers: string[];       // ["and", "or", "with", "but", "then"]
  currentIndex: number;      // which one is showing
} | null;
```

### Prediction Service
- Wire up existing `getModifiers()` stub in `services/predictions.ts`
- Input: intent, current phrase, target item
- Output: `string[]` — ranked modifier list (note: the existing stub returns `ComposeItem[]`; this must be changed to return plain strings since modifiers are simple connectors, not selectable items)
- Fallback defaults defined in `constants/fallbacks.ts`: `["and", "or", "with", "but", "then", "not"]`

### Files Changed
- `stores/composition.ts` — add `modifierState`, `cycleModifier()`, `clearModifier()` methods
- `services/predictions.ts` — implement `getModifiers()` (already stubbed)
- `components/sections/ComposeSection.tsx` — wire single tap to modifier cycling
- `app/(app)/index.tsx` — wire single tap on home screen items
- `supabase/functions/predict/index.ts` — add modifier endpoint or extend predict

---

## Gesture Map (Updated)

### Home Screen (WheelPicker)
| Gesture | Action |
|---------|--------|
| Swipe up/down | Scroll through cards, focus follows center |
| Single tap | Cycle modifier on focused card |
| Double tap | Select card, navigate to compose with context pre-loaded |
| Left swipe | No-op (no prediction history on home screen) |
| Right swipe | No-op (no prediction history on home screen) |

### Compose Screen — ComposeSection (WheelPicker)
| Gesture | Action |
|---------|--------|
| Swipe up/down | Scroll predictions, focus follows center |
| Right swipe | Advance — select item, push history, load next predictions |
| Left swipe | Backtrack — pop history or diverge if empty |
| Single tap | Cycle modifier on focused item |
| Double tap | Select item, add to phrase (without advancing predictions) |
| Long press | Context menu (future) |

### Compose Screen — PhraseSection
| Gesture | Action |
|---------|--------|
| Left swipe | Undo last slot |
| Right swipe | Redo |
| Up swipe | Return to ComposeSection |
| Down swipe | Save phrase (future) |
| Double tap | Speak phrase (future) |

### Compose Screen — IntentSection (minimized bar)
| Gesture | Action |
|---------|--------|
| Up swipe | Expand to full intent selector |
| Tap | Expand to full intent selector |

---

## Files Summary

### New Files
- `components/shared/WheelPicker.tsx` — shared picker component
- `components/home/StarterCard.tsx` — home screen item renderer

### Modified Files
- `app/(app)/index.tsx` — home screen redesign
- `app/(app)/compose.tsx` — pre-loading, route params, skip intent confirmation
- `components/sections/IntentSection.tsx` — collapsed mode
- `components/sections/ComposeSection.tsx` — WheelPicker, new swipe behavior, modifier tap
- `stores/composition.ts` — predictionHistory, triedPaths, modifierState, pre-fetch support
- `stores/focus.ts` — WheelPicker owns scroll-based focus index via `onFocusChange` callback. The focus store's `composeIndex` is driven by WheelPicker (WheelPicker calls `onFocusChange` → handler updates `composeIndex` in focus store). Section model changes: `'intent'` section is rarely active (only when minimized bar is expanded). Default flow is `'compose'` ↔ `'phrase'`. Home screen does not use the focus store — WheelPicker manages its own local focus index there.
- `services/predictions.ts` — divergent paths, implement getModifiers()
- `supabase/functions/predict/index.ts` — divergent path prompt, modifier support
- `constants/fallbacks.ts` — add modifier fallbacks

### Potentially Deprecated
- `components/home/FlowCard.tsx` — replaced by WheelPicker + StarterCard
- `components/shared/FocusIndicator.tsx` — focus handled by WheelPicker internally
