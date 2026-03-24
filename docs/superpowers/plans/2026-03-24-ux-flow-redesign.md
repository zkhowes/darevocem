# UX Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the home and compose screens to reduce friction — unified launchpad with WheelPicker, pre-loaded compose, prediction history navigation, and modifier cycling.

**Architecture:** Evolutionary refactor of existing screens. New shared `WheelPicker` component replaces flat lists on both home and compose. Composition store gains prediction history stack, modifier state, and pre-load support. Prediction service gains divergent path and modifier endpoints.

**Tech Stack:** React Native (Expo), TypeScript, Zustand, react-native-reanimated, Supabase Edge Functions (Deno), Claude API

**Spec:** `docs/superpowers/specs/2026-03-24-ux-flow-redesign.md`

---

### Task 1: Add new types and constants

**Files:**
- Modify: `types/index.ts`
- Modify: `constants/config.ts`
- Modify: `constants/fallbacks.ts`
- Modify: `constants/theme.ts`

- [ ] **Step 1: Add new types to `types/index.ts`**

Add after the existing `StepAction` type (line 96):

```typescript
// Add 'advance', 'backtrack', 'diverge' to StepAction
export type StepAction = 'select' | 'reject' | 'refine' | 'modify' | 'undo' | 'redo' | 'focus_change' | 'advance' | 'backtrack' | 'diverge';
```

Add after the `ComposeItem` interface (after line 52):

```typescript
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
}

export interface ModifierState {
  targetItem: string;
  modifiers: string[];
  currentIndex: number;
}
```

- [ ] **Step 2: Add WheelPicker layout constants to `constants/config.ts`**

Add to the `LAYOUT` object literal (BEFORE the closing `} as const;` — the `as const` assertion must be preserved):

```typescript
// Inside LAYOUT, after focusScale: 1.02,
wheelPickerFocusedHeight: 120,
wheelPickerItemHeight: 72,
wheelPickerFocusedFontSize: 32,
wheelPickerItemFontSize: 22,
```

- [ ] **Step 3: Add modifier fallbacks to `constants/fallbacks.ts`**

Add after the existing `FALLBACK_PREDICTIONS`:

```typescript
export const FALLBACK_MODIFIERS: string[] = ['and', 'or', 'with', 'but', 'then', 'not'];
```

- [ ] **Step 4: Add saved card color to `constants/theme.ts`**

Add to both `lightColors` and `darkColors`:

```typescript
// lightColors — after focusIndicator
savedAccent: '#7B68AE',
savedAccentFaded: 'rgba(123, 104, 174, 0.15)',
```

```typescript
// darkColors — after focusIndicator
savedAccent: '#9B88CE',
savedAccentFaded: 'rgba(155, 136, 206, 0.15)',
```

**Important:** Update the `ThemeColors` interface FIRST (before adding to the color objects), since the objects are typed as `ThemeColors`:

```typescript
// Add to ThemeColors interface, after phraseBarBorder
savedAccent: string;
savedAccentFaded: string;
```

Then add the values to both `lightColors` and `darkColors`.

- [ ] **Step 5: Run tests to verify nothing breaks**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest --no-coverage 2>&1 | tail -20`
Expected: All existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add types/index.ts constants/config.ts constants/fallbacks.ts constants/theme.ts
git commit -m "feat: add types and constants for UX flow redesign"
```

---

### Task 2: Extend composition store with prediction history, modifiers, and preload

**Files:**
- Modify: `stores/composition.ts`
- Modify: `__tests__/composition.test.ts`

- [ ] **Step 1: Write failing tests for new store methods**

Add to `__tests__/composition.test.ts`:

```typescript
import type { ComposeItem, PredictionHistoryEntry } from '../types';

const mockPredictions: ComposeItem[] = [
  { id: '1', text: 'water', itemType: 'prediction', rank: 0 },
  { id: '2', text: 'help', itemType: 'prediction', rank: 1 },
];

const mockPredictions2: ComposeItem[] = [
  { id: '3', text: 'cold', itemType: 'prediction', rank: 0 },
  { id: '4', text: 'hot', itemType: 'prediction', rank: 1 },
];

describe('CompositionStore — preload', () => {
  it('sets intent and predictions without resetting sessionId', () => {
    const originalId = useCompositionStore.getState().sessionId;
    useCompositionStore.getState().preload('I need', mockPredictions);
    const { intent, predictions, sessionId } = useCompositionStore.getState();
    expect(intent).toBe('I need');
    expect(predictions).toEqual(mockPredictions);
    expect(sessionId).toBe(originalId);
  });
});

describe('CompositionStore — advance (right swipe)', () => {
  it('pushes current predictions to history, adds slot, and sets new predictions', () => {
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().setPredictions(mockPredictions);
    useCompositionStore.getState().advance('water', mockPredictions2);
    const { slots, predictions, predictionHistory } = useCompositionStore.getState();
    expect(slots).toEqual(['water']);
    expect(predictions).toEqual(mockPredictions2);
    expect(predictionHistory).toHaveLength(1);
    expect(predictionHistory[0].slot).toBe('water');
    expect(predictionHistory[0].predictions).toEqual(mockPredictions);
  });
});

describe('CompositionStore — backtrack (left swipe with history)', () => {
  it('pops prediction history and removes last slot', () => {
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().setPredictions(mockPredictions);
    useCompositionStore.getState().advance('water', mockPredictions2);
    useCompositionStore.getState().backtrack();
    const { slots, predictions, predictionHistory } = useCompositionStore.getState();
    expect(slots).toEqual([]);
    expect(predictions).toEqual(mockPredictions);
    expect(predictionHistory).toHaveLength(0);
  });

  it('does nothing when history is empty', () => {
    useCompositionStore.getState().setIntent('I need');
    useCompositionStore.getState().setPredictions(mockPredictions);
    const result = useCompositionStore.getState().backtrack();
    expect(result).toBe(false);
    expect(useCompositionStore.getState().predictions).toEqual(mockPredictions);
  });
});

describe('CompositionStore — recordTriedPath', () => {
  it('adds a path to triedPaths', () => {
    useCompositionStore.getState().recordTriedPath(['I need', 'water', 'cold']);
    expect(useCompositionStore.getState().triedPaths).toEqual([['I need', 'water', 'cold']]);
  });
});

describe('CompositionStore — modifier cycling', () => {
  it('setModifiers sets modifier state for a target item', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or', 'with']);
    const { modifierState } = useCompositionStore.getState();
    expect(modifierState).toEqual({ targetItem: 'coffee', modifiers: ['and', 'or', 'with'], currentIndex: 0 });
  });

  it('cycleModifier advances to next modifier and loops', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or', 'with']);
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().modifierState!.currentIndex).toBe(1);
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().modifierState!.currentIndex).toBe(2);
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().modifierState!.currentIndex).toBe(0); // loops
  });

  it('clearModifier resets modifier state to null', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or']);
    useCompositionStore.getState().clearModifier();
    expect(useCompositionStore.getState().modifierState).toBeNull();
  });

  it('getDisplayText returns item + current modifier', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and', 'or']);
    expect(useCompositionStore.getState().getModifierDisplayText()).toBe('coffee and');
    useCompositionStore.getState().cycleModifier();
    expect(useCompositionStore.getState().getModifierDisplayText()).toBe('coffee or');
  });

  it('getModifierDisplayText returns null when no modifier active', () => {
    expect(useCompositionStore.getState().getModifierDisplayText()).toBeNull();
  });
});

describe('CompositionStore — preloadSavedPhrase', () => {
  it('sets intent to null and slots to full phrase text', () => {
    useCompositionStore.getState().preloadSavedPhrase('My name is Amanda');
    const { intent, slots } = useCompositionStore.getState();
    expect(intent).toBeNull();
    expect(slots).toEqual(['My name is Amanda']);
    expect(useCompositionStore.getState().getPhrase()).toBe('My name is Amanda');
  });
});

describe('CompositionStore — preloadCommonItem', () => {
  it('sets the value as first slot with no intent', () => {
    useCompositionStore.getState().preloadCommonItem('March 24');
    const { intent, slots } = useCompositionStore.getState();
    expect(intent).toBeNull();
    expect(slots).toEqual(['March 24']);
  });
});

describe('CompositionStore — reset clears new fields', () => {
  it('clears predictionHistory, triedPaths, and modifierState on reset', () => {
    useCompositionStore.getState().setModifiers('coffee', ['and']);
    useCompositionStore.getState().recordTriedPath(['I need', 'water']);
    useCompositionStore.getState().reset();
    const { predictionHistory, triedPaths, modifierState } = useCompositionStore.getState();
    expect(predictionHistory).toEqual([]);
    expect(triedPaths).toEqual([]);
    expect(modifierState).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest __tests__/composition.test.ts --no-coverage 2>&1 | tail -20`
Expected: New tests FAIL (methods don't exist yet).

- [ ] **Step 3: Implement new store methods in `stores/composition.ts`**

Update the interface to add new fields and methods:

```typescript
interface CompositionStore {
  // ... existing fields ...
  predictionHistory: PredictionHistoryEntry[];
  triedPaths: string[][];
  modifierState: ModifierState | null;

  preload: (intent: string, predictions: ComposeItem[]) => void;
  preloadSavedPhrase: (text: string) => void;
  preloadCommonItem: (value: string) => void;
  advance: (selectedText: string, nextPredictions: ComposeItem[]) => void;
  backtrack: () => boolean;
  recordTriedPath: (path: string[]) => void;
  setModifiers: (targetItem: string, modifiers: string[]) => void;
  cycleModifier: () => void;
  clearModifier: () => void;
  getModifierDisplayText: () => string | null;
}
```

Add initial state values:

```typescript
predictionHistory: [],
triedPaths: [],
modifierState: null,
```

Add method implementations:

```typescript
preload: (intent, predictions) => set({
  intent,
  predictions,
  isLoading: false,
  slots: [],
  undoStack: [],
  predictionHistory: [],
  triedPaths: [],
  modifierState: null,
}),

preloadSavedPhrase: (text) => set({
  intent: null,
  slots: [text],
  predictions: [],
  isLoading: false,
  undoStack: [],
  predictionHistory: [],
  triedPaths: [],
  modifierState: null,
}),

preloadCommonItem: (value) => set({
  intent: null,
  slots: [value],
  isLoading: true, // predictions will be fetched for what comes next
  undoStack: [],
  predictionHistory: [],
  triedPaths: [],
  modifierState: null,
}),

advance: (selectedText, nextPredictions) => set((s) => ({
  slots: [...s.slots, selectedText],
  predictionHistory: [...s.predictionHistory, {
    predictions: s.predictions,
    slot: selectedText,
  }],
  predictions: nextPredictions,
  undoStack: [],
  modifierState: null,
})),

backtrack: () => {
  const { predictionHistory, slots } = get();
  if (predictionHistory.length === 0) return false;
  const previous = predictionHistory[predictionHistory.length - 1];
  set({
    predictions: previous.predictions,
    slots: slots.slice(0, -1),
    predictionHistory: predictionHistory.slice(0, -1),
    modifierState: null,
  });
  return true;
},

recordTriedPath: (path) => set((s) => ({
  triedPaths: [...s.triedPaths, path],
})),

setModifiers: (targetItem, modifiers) => set({
  modifierState: { targetItem, modifiers, currentIndex: 0 },
}),

cycleModifier: () => {
  const { modifierState } = get();
  if (!modifierState) return;
  set({
    modifierState: {
      ...modifierState,
      currentIndex: (modifierState.currentIndex + 1) % modifierState.modifiers.length,
    },
  });
},

clearModifier: () => set({ modifierState: null }),

getModifierDisplayText: () => {
  const { modifierState } = get();
  if (!modifierState) return null;
  return `${modifierState.targetItem} ${modifierState.modifiers[modifierState.currentIndex]}`;
},
```

Update `reset()` to include new fields:

```typescript
reset: () => set({
  // ... existing fields ...
  predictionHistory: [],
  triedPaths: [],
  modifierState: null,
}),
```

Update `partialize` to also persist `predictionHistory` for crash recovery:

```typescript
partialize: (state) => ({
  sessionId: state.sessionId,
  intent: state.intent,
  slots: state.slots,
  startedAt: state.startedAt,
  predictionHistory: state.predictionHistory,
}),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest __tests__/composition.test.ts --no-coverage 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add stores/composition.ts __tests__/composition.test.ts
git commit -m "feat: add prediction history, modifier cycling, and preload to composition store"
```

---

### Task 3: Update prediction service for divergent paths and modifiers

**Files:**
- Modify: `services/predictions.ts`
- Modify: `supabase/functions/predict/index.ts`
- Modify: `__tests__/predictions.test.ts`

- [ ] **Step 1: Replace existing `getModifiers` tests with new `string[]` tests**

In `__tests__/predictions.test.ts`, **remove** the existing `getModifiers` describe block (lines 178-196) which tests the old `ComposeItem[]` return type. Replace with:

```typescript
describe('getModifiers — fallback', () => {
  it('returns string[] of modifier words, not ComposeItem[]', async () => {
    const result = await getModifiers('I need', ['water'], 'coffee');
    expect(typeof result[0]).toBe('string');
    expect(result).toContain('and');
  });

  it('returns at least 3 fallback modifiers', async () => {
    const result = await getModifiers('I want', [], 'coffee');
    expect(result.length).toBeGreaterThanOrEqual(3);
    // All items should be plain strings
    result.forEach((m) => expect(typeof m).toBe('string'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest __tests__/predictions.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL (current `getModifiers` returns `ComposeItem[]`).

- [ ] **Step 3: Update `getModifiers` in `services/predictions.ts`**

Change return type from `ComposeItem[]` to `string[]`:

```typescript
/**
 * Returns modifier words for a selected item ranked by probability.
 * Falls back to curated defaults if API fails.
 */
export async function getModifiers(
  intent: string,
  currentPhrase: string[],
  targetItem: string,
): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        intent,
        currentPhrase,
        targetItem,
        requestType: 'modifiers',
      },
    });

    if (error || !data || !data.modifiers || data.modifiers.length === 0) {
      return FALLBACK_MODIFIERS;
    }

    return data.modifiers as string[];
  } catch {
    return FALLBACK_MODIFIERS;
  }
}
```

Add import at the top:

```typescript
import { FALLBACK_PREDICTIONS, FALLBACK_MODIFIERS } from '../constants/fallbacks';
```

- [ ] **Step 4: Add `triedPaths` parameter to `getPredictions`**

Update the function signature and body:

```typescript
export async function getPredictions(
  intent: string,
  currentPhrase: string[],
  currentSlot: string,
  timeOfDay: TimeOfDay,
  recentSelections: string[],
  recentRejections: string[],
  triedPaths?: string[][],
): Promise<ComposeItem[]> {
  try {
    const { data, error } = await supabase.functions.invoke('predict', {
      body: {
        intent,
        currentPhrase,
        currentSlot,
        sessionContext: { timeOfDay, recentSelections, recentRejections },
        triedPaths: triedPaths ?? [],
      },
    });
    // ... rest unchanged ...
```

- [ ] **Step 5: Update Edge Function `supabase/functions/predict/index.ts`**

Add handling for `requestType: 'modifiers'` and `triedPaths` to the edge function.

After `const { intent, currentPhrase, currentSlot, sessionContext } = body;` (line 44), add:

```typescript
const { requestType, targetItem, triedPaths } = body;
```

Add a modifier branch before the main prediction flow (after auth check):

```typescript
// Handle modifier requests
if (requestType === 'modifiers') {
  const modifierMessage = `For the word "${targetItem}" in the context of "${intent} ${currentPhrase.join(' ')}", suggest 4-6 modifier/connector words ranked by probability (e.g., "and", "or", "with", "but").

Return ONLY valid JSON: {"modifiers": ["and", "or", "with"]}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      temperature: 0.5,
      messages: [{ role: 'user', content: modifierMessage }],
    }),
    signal: controller.signal,
  });

  clearTimeout(timeout);
  if (!response.ok) {
    return new Response(JSON.stringify({ modifiers: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  const result = await response.json();
  const content = result.content?.[0]?.text ?? '{"modifiers": []}';
  const parsed = JSON.parse(content);
  return new Response(JSON.stringify({ modifiers: parsed.modifiers ?? [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
```

Add tried paths to the user message in the main prediction flow:

```typescript
const triedPathsStr = triedPaths && triedPaths.length > 0
  ? `\n- Paths already tried and rejected: ${triedPaths.map((p: string[]) => p.join(' → ')).join('; ')}`
  : '';

const userMessage = `Intent: "${intent}"
Phrase so far: "${currentPhrase.join(' ')}"
Predict the next ${currentSlot}.

User patterns:
- Time of day: ${sessionContext.timeOfDay}
- Top selections for "${intent}" at this time: ${topSelections.join(', ') || 'none yet'}
- Recent session selections: ${sessionContext.recentSelections?.join(', ') || 'none'}
- Recently rejected: ${sessionContext.recentRejections?.join(', ') || 'none'}${triedPathsStr}`;
```

- [ ] **Step 6: Run tests**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest __tests__/predictions.test.ts --no-coverage 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add services/predictions.ts supabase/functions/predict/index.ts __tests__/predictions.test.ts constants/fallbacks.ts
git commit -m "feat: add modifier and divergent path support to prediction service"
```

---

### Task 4: Build WheelPicker component

**Files:**
- Create: `components/shared/WheelPicker.tsx`

- [ ] **Step 1: Create `components/shared/WheelPicker.tsx`**

```typescript
import React, { useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, type ViewToken } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  interpolate,
} from 'react-native-reanimated';
import { GestureArea } from '../gestures/GestureArea';
import { LAYOUT, TIMING } from '../../constants/config';
import type { GestureAction, WheelPickerItem } from '../../types';

interface WheelPickerProps {
  items: WheelPickerItem[];
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onGesture: (gesture: GestureAction, item: WheelPickerItem, index: number) => void;
  renderItem: (item: WheelPickerItem, isFocused: boolean) => React.ReactNode;
}

function WheelPickerItemView({
  item,
  isFocused,
  onGesture,
  renderItem,
}: {
  item: WheelPickerItem;
  isFocused: boolean;
  onGesture: (gesture: GestureAction) => void;
  renderItem: (item: WheelPickerItem, isFocused: boolean) => React.ReactNode;
}) {
  const scale = useSharedValue(isFocused ? 1 : 0.95);
  const height = useSharedValue(
    isFocused ? LAYOUT.wheelPickerFocusedHeight : LAYOUT.wheelPickerItemHeight,
  );

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1 : 0.95, {
      duration: TIMING.focusAnimationMs,
    });
    height.value = withSpring(
      isFocused ? LAYOUT.wheelPickerFocusedHeight : LAYOUT.wheelPickerItemHeight,
      { duration: TIMING.focusAnimationMs },
    );
  }, [isFocused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    height: height.value,
  }));

  return (
    <GestureArea onAction={onGesture} style={styles.gestureWrapper}>
      <Animated.View
        style={[
          styles.itemContainer,
          isFocused && {
            backgroundColor: item.color,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 3,
          },
          !isFocused && {
            backgroundColor: '#FFFFFF',
            borderLeftWidth: 4,
            borderLeftColor: item.color,
          },
          animatedStyle,
        ]}
      >
        {renderItem(item, isFocused)}
      </Animated.View>
    </GestureArea>
  );
}

export function WheelPicker({
  items,
  focusedIndex,
  onFocusChange,
  onGesture,
  renderItem,
}: WheelPickerProps) {
  const flatListRef = useRef<FlatList>(null);

  // Scroll to focused item when focusedIndex changes
  React.useEffect(() => {
    if (flatListRef.current && items.length > 0 && focusedIndex >= 0 && focusedIndex < items.length) {
      flatListRef.current.scrollToIndex({
        index: focusedIndex,
        animated: true,
        viewPosition: 0.5, // center the focused item
      });
    }
  }, [focusedIndex, items.length]);

  const handleGesture = useCallback(
    (gesture: GestureAction, item: WheelPickerItem, index: number) => {
      // Up/down swipes change focus within the picker
      if (gesture.type === 'swipe') {
        if (gesture.direction === 'down' && index < items.length - 1) {
          onFocusChange(index + 1);
          return;
        }
        if (gesture.direction === 'up' && index > 0) {
          onFocusChange(index - 1);
          return;
        }
      }
      // All other gestures forwarded to parent
      onGesture(gesture, item, index);
    },
    [items.length, onFocusChange, onGesture],
  );

  const renderListItem = useCallback(
    ({ item, index }: { item: WheelPickerItem; index: number }) => (
      <WheelPickerItemView
        item={item}
        isFocused={index === focusedIndex}
        onGesture={(gesture) => handleGesture(gesture, item, index)}
        renderItem={renderItem}
      />
    ),
    [focusedIndex, handleGesture, renderItem],
  );

  const getItemLayout = useCallback(
    (_data: WheelPickerItem[] | null | undefined, index: number) => {
      // Approximate — focused item is taller but we use viewPosition for centering
      const itemHeight = LAYOUT.wheelPickerItemHeight + LAYOUT.itemGap;
      return {
        length: itemHeight,
        offset: itemHeight * index,
        index,
      };
    },
    [],
  );

  return (
    <FlatList
      ref={flatListRef}
      data={items}
      renderItem={renderListItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      getItemLayout={getItemLayout}
      initialScrollIndex={Math.min(focusedIndex, Math.max(0, items.length - 1))}
      onScrollToIndexFailed={() => {
        // Fallback: scroll to start if the index is out of bounds
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: LAYOUT.screenPadding,
    gap: LAYOUT.itemGap,
  },
  gestureWrapper: {
    marginHorizontal: LAYOUT.screenPadding,
  },
  itemContainer: {
    borderRadius: 12,
    justifyContent: 'center',
    paddingHorizontal: LAYOUT.screenPadding,
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx tsc --noEmit 2>&1 | tail -20`
Expected: No type errors related to WheelPicker.

- [ ] **Step 3: Commit**

```bash
git add components/shared/WheelPicker.tsx
git commit -m "feat: add WheelPicker component with focus-centered scrolling"
```

---

### Task 5: Update focus store for WheelPicker model

**Files:**
- Modify: `stores/focus.ts`
- Modify: `__tests__/focus.test.ts`

- [ ] **Step 1: Rewrite `__tests__/focus.test.ts` for new default section**

The default section changes from `'intent'` to `'compose'`. Many existing tests assumed `'intent'` as the starting point. Replace the entire test file:

```typescript
import { useFocusStore } from '../stores/focus';

beforeEach(() => {
  useFocusStore.getState().reset();
  useFocusStore.getState().setComposeListSize(3);
});

describe('FocusStore — initial state', () => {
  it('starts in compose section at index 0', () => {
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });
});

describe('FocusStore — moveDown', () => {
  it('increments index when in compose and not at last item', () => {
    useFocusStore.getState().moveDown(); // compose[0] -> compose[1]
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(1);
  });

  it('moves from last compose item -> phrase', () => {
    useFocusStore.getState().setComposeIndex(2); // last item
    useFocusStore.getState().moveDown(); // compose[2] -> phrase
    const { section } = useFocusStore.getState();
    expect(section).toBe('phrase');
  });

  it('moves from intent -> compose at index 0 (when intent section is active)', () => {
    useFocusStore.getState().setSection('intent');
    useFocusStore.getState().moveDown();
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });
});

describe('FocusStore — moveUp', () => {
  it('decrements index when in compose above index 0', () => {
    useFocusStore.getState().setComposeIndex(1);
    useFocusStore.getState().moveUp(); // compose[1] -> compose[0]
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });

  it('stays at compose index 0 when moveUp at top (screen handles navigation)', () => {
    useFocusStore.getState().moveUp(); // at compose[0], stays
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });

  it('moves from phrase -> compose, restoring previous index', () => {
    useFocusStore.getState().setComposeIndex(2);
    useFocusStore.getState().moveDown(); // compose[2] -> phrase (stores previousComposeIndex = 2)
    useFocusStore.getState().moveUp(); // phrase -> compose[2]
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(2);
  });
});

describe('FocusStore — setComposeIndex', () => {
  it('sets a specific index directly', () => {
    useFocusStore.getState().setComposeIndex(2);
    expect(useFocusStore.getState().composeIndex).toBe(2);
  });
});

describe('FocusStore — reset', () => {
  it('returns to compose section at index 0', () => {
    useFocusStore.getState().setComposeIndex(2);
    useFocusStore.getState().setSection('phrase');
    useFocusStore.getState().reset();
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail with current store**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest __tests__/focus.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL (store still defaults to 'intent').

- [ ] **Step 3: Update `stores/focus.ts`**

Change default section from `'intent'` to `'compose'`:

```typescript
// Initial state and reset — compose is now the default since home screen handles intent selection
section: 'compose' as FocusSection,
```

Update `reset()`:

```typescript
reset: () => set({
  section: 'compose',
  composeIndex: 0,
  previousComposeIndex: 0,
}),
```

Update `moveUp` — when at compose index 0, instead of going to 'intent', forward to parent (the screen will handle navigation):

```typescript
moveUp: () => {
  const { section, composeIndex, previousComposeIndex } = get();
  if (section === 'phrase') {
    set({ section: 'compose', composeIndex: previousComposeIndex });
  } else if (section === 'compose') {
    if (composeIndex > 0) {
      set({ composeIndex: composeIndex - 1 });
    }
    // At index 0 + moveUp: screen handles (expand intent bar or navigate home)
  }
},
```

- [ ] **Step 4: Run all focus tests**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest __tests__/focus.test.ts --no-coverage 2>&1 | tail -20`
Expected: All tests PASS (may need to update existing tests that expected 'intent' default).

- [ ] **Step 5: Commit**

```bash
git add stores/focus.ts __tests__/focus.test.ts
git commit -m "feat: update focus store — compose as default section, WheelPicker drives index"
```

---

### Task 6: Rebuild ComposeSection with WheelPicker and new gesture handling

**Files:**
- Modify: `components/sections/ComposeSection.tsx`

- [ ] **Step 1: Rewrite `ComposeSection.tsx`**

Replace the FlatList-based implementation with WheelPicker. Wire up new gesture map:
- Right swipe → advance (parent callback)
- Left swipe → backtrack (parent callback)
- Single tap → modifier cycling (parent callback)
- Double tap → select (add to phrase without advancing)
- Up/down → handled by WheelPicker internally

```typescript
import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { WheelPicker } from '../shared/WheelPicker';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';
import type { GestureAction, ComposeItem, WheelPickerItem } from '../../types';

interface ComposeSectionProps {
  onAdvance: (item: ComposeItem) => void;
  onBacktrack: () => void;
  onDiverge: () => void;
  onModifierTap: (item: ComposeItem) => void;
}

export function ComposeSection({ onAdvance, onBacktrack, onDiverge, onModifierTap }: ComposeSectionProps) {
  const predictions = useCompositionStore((s) => s.predictions);
  const isLoading = useCompositionStore((s) => s.isLoading);
  const addSlot = useCompositionStore((s) => s.addSlot);
  const addEvent = useCompositionStore((s) => s.addEvent);
  const modifierState = useCompositionStore((s) => s.modifierState);
  const predictionHistory = useCompositionStore((s) => s.predictionHistory);

  const composeIndex = useFocusStore((s) => s.composeIndex);
  const setComposeIndex = useFocusStore((s) => s.setComposeIndex);
  const setComposeListSize = useFocusStore((s) => s.setComposeListSize);
  const section = useFocusStore((s) => s.section);
  const moveDown = useFocusStore((s) => s.moveDown);

  React.useEffect(() => {
    setComposeListSize(predictions.length);
  }, [predictions.length]);

  // Convert ComposeItems to WheelPickerItems
  const wheelItems: WheelPickerItem[] = predictions.map((p) => ({
    id: p.id,
    text: p.text,
    itemType: p.itemType === 'recent' ? 'prediction' : p.itemType,
    color: p.itemType === 'common' ? '#2B7A78' : p.itemType === 'saved' ? '#7B68AE' : '#E07B2E',
    metadata: { rank: p.rank, value: p.value, label: p.label },
  }));

  const handleFocusChange = useCallback((index: number) => {
    setComposeIndex(index);
    // Clear modifier when focus changes
    useCompositionStore.getState().clearModifier();
  }, [setComposeIndex]);

  const handleGesture = useCallback(
    (gesture: GestureAction, item: WheelPickerItem, index: number) => {
      if (section !== 'compose') return;

      const prediction = predictions[index];
      if (!prediction) return;

      const logEvent = (action: string) => {
        const state = useCompositionStore.getState();
        addEvent({
          action: action as any,
          item_text: item.text,
          item_type: prediction.itemType,
          item_rank: index,
          phrase_state: state.getPhrase(),
          timestamp_ms: Date.now() - state.startedAt,
        });
      };

      switch (gesture.type) {
        case 'swipe':
          switch (gesture.direction) {
            case 'right':
              onAdvance(prediction);
              logEvent('advance');
              break;
            case 'left':
              if (predictionHistory.length > 0) {
                onBacktrack();
                logEvent('backtrack');
              } else {
                onDiverge();
                logEvent('diverge');
              }
              break;
            case 'down':
              // Move to phrase section when at last item
              if (index === predictions.length - 1) {
                moveDown();
              }
              break;
            // 'up' at index 0 is forwarded by WheelPicker to parent via onGesture
            // but we already handle up/down within WheelPicker
          }
          break;
        case 'double-tap':
          addSlot(prediction.value ?? prediction.text);
          logEvent('select');
          break;
        case 'tap':
          onModifierTap(prediction);
          break;
        case 'long-press':
          // Context menu (future)
          break;
      }
    },
    [section, predictions, predictionHistory.length, onAdvance, onBacktrack, onDiverge, onModifierTap, addSlot, addEvent, moveDown],
  );

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => {
      // Show modifier text if this is the focused item with active modifier
      const displayText = isFocused && modifierState && modifierState.targetItem === item.text
        ? useCompositionStore.getState().getModifierDisplayText() ?? item.text
        : item.text;

      return (
        <View style={styles.itemContent}>
          <Text style={[
            styles.itemLabel,
            isFocused && styles.focusedLabel,
          ]}>
            {item.itemType === 'prediction' ? 'P' : item.itemType === 'common' ? 'C' : 'S'}
            {(item.metadata?.rank as number ?? 0) + 1}
          </Text>
          <Text style={[
            isFocused ? styles.focusedText : styles.itemText,
          ]}>
            {displayText}
          </Text>
        </View>
      );
    },
    [modifierState],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.shimmer} />
        ))}
      </View>
    );
  }

  return (
    <WheelPicker
      items={wheelItems}
      focusedIndex={composeIndex}
      onFocusChange={handleFocusChange}
      onGesture={handleGesture}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemLabel: {
    fontSize: TYPOGRAPHY.itemLabel.size,
    color: '#6B6B6B',
    marginRight: 8,
  },
  focusedLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  itemText: {
    fontSize: TYPOGRAPHY.wheelPickerItem?.size ?? LAYOUT.wheelPickerItemFontSize,
    fontWeight: '500',
    color: '#1A1A1A',
    flex: 1,
  },
  focusedText: {
    fontSize: LAYOUT.wheelPickerFocusedFontSize,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  loadingContainer: {
    gap: LAYOUT.itemGap,
    paddingHorizontal: LAYOUT.screenPadding,
  },
  shimmer: {
    height: LAYOUT.wheelPickerItemHeight,
    backgroundColor: '#D5D5D0',
    borderRadius: 12,
  },
});
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx tsc --noEmit 2>&1 | tail -20`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add components/sections/ComposeSection.tsx
git commit -m "feat: rebuild ComposeSection with WheelPicker and new gesture map"
```

---

### Task 7: Add collapsed mode to IntentSection

**Files:**
- Modify: `components/sections/IntentSection.tsx`

- [ ] **Step 1: Update `IntentSection.tsx` with collapsed/expanded modes**

Add a `collapsed` prop. When collapsed, render as a small bar showing current intent. Tap or swipe up expands it.

```typescript
interface IntentSectionProps {
  onNavigateHome: () => void;
  timeOfDay: TimeOfDay;
  collapsed?: boolean;
  onExpand?: () => void;
  initialIntent?: string; // pre-selected from home screen
}

export function IntentSection({
  onNavigateHome,
  timeOfDay,
  collapsed = true,
  onExpand,
  initialIntent,
}: IntentSectionProps) {
  const [intentIndex, setIntentIndex] = useState(() => {
    if (initialIntent) {
      const idx = INTENTS.findIndex((i) => i.text === initialIntent);
      return idx >= 0 ? idx : DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;
    }
    return DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;
  });

  // ... existing cycleIntent, confirmIntent ...

  const handleAction = (action: GestureAction) => {
    if (collapsed) {
      // In collapsed mode, tap or swipe up expands
      if (action.type === 'tap' || (action.type === 'swipe' && action.direction === 'up')) {
        onExpand?.();
      }
      return;
    }
    // ... existing expanded behavior ...
  };

  if (collapsed) {
    return (
      <GestureArea onAction={handleAction} style={styles.collapsedContainer}>
        <Text style={styles.collapsedLabel}>Intent: </Text>
        <Text style={styles.collapsedText}>{currentIntent.text}</Text>
      </GestureArea>
    );
  }

  // ... existing expanded render ...
}
```

Add collapsed styles:

```typescript
collapsedContainer: {
  height: 44,
  justifyContent: 'center',
  paddingHorizontal: LAYOUT.screenPadding,
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(224, 123, 46, 0.1)',
  borderRadius: 8,
  marginHorizontal: LAYOUT.screenPadding,
},
collapsedLabel: {
  fontSize: 14,
  color: '#6B6B6B',
},
collapsedText: {
  fontSize: 18,
  fontWeight: '600',
  color: '#E07B2E',
},
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx tsc --noEmit 2>&1 | tail -20`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add components/sections/IntentSection.tsx
git commit -m "feat: add collapsed mode to IntentSection"
```

---

### Task 8: Rewrite compose screen with pre-loading and new gesture wiring

**Files:**
- Modify: `app/(app)/compose.tsx`

- [ ] **Step 1: Rewrite `compose.tsx`**

Key changes:
- Read route params for pre-loaded context
- Conditional mount reset (skip if pre-loaded)
- IntentSection collapsed by default with expand toggle
- Wire ComposeSection to advance/backtrack/diverge/modifier callbacks
- Handle divergent path fetching

```typescript
import React, { useEffect, useCallback, useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { IntentSection } from '../../components/sections/IntentSection';
import { ComposeSection } from '../../components/sections/ComposeSection';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getModifiers } from '../../services/predictions';
import { FALLBACK_MODIFIERS } from '../../constants/fallbacks';
import type { ComposeItem } from '../../types';

export default function ComposeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; value?: string; intent?: string }>();
  const focusReset = useFocusStore((s) => s.reset);
  const setSection = useFocusStore((s) => s.setSection);
  const intent = useCompositionStore((s) => s.intent);
  const slots = useCompositionStore((s) => s.slots);
  const [intentCollapsed, setIntentCollapsed] = useState(true);

  // Conditional mount: skip reset if pre-loaded state exists
  useEffect(() => {
    const { intent: currentIntent, predictions, slots } = useCompositionStore.getState();
    if (currentIntent || predictions.length > 0 || slots.length > 0) {
      // Pre-loaded from home screen — don't reset
      focusReset();
      // For saved phrases, focus on PhraseSection for immediate speak/modify
      if (params.type === 'saved') {
        setSection('phrase');
      }
      return;
    }
    // Direct navigation (deep link) — full reset
    useCompositionStore.getState().reset();
    focusReset();
  }, []);

  // Fetch predictions when intent changes and no predictions are pre-loaded
  useEffect(() => {
    if (!intent) return;
    const { predictions, isLoading } = useCompositionStore.getState();
    // Skip if predictions already loaded (pre-fetch from home)
    if (predictions.length > 0 && !isLoading) return;

    const { setPredictions, setLoading, triedPaths } = useCompositionStore.getState();
    let cancelled = false;

    async function fetchPredictions() {
      setLoading(true);
      try {
        const items = await getPredictions(
          intent!,
          slots,
          'object',
          getTimeOfDay(),
          [],
          [],
          triedPaths,
        );
        if (!cancelled) setPredictions(items);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPredictions();
    return () => { cancelled = true; };
  }, [intent, slots.length]);

  const handleNavigateHome = useCallback(() => {
    router.back();
  }, []);

  // Right swipe: advance down prediction path
  const handleAdvance = useCallback(async (item: ComposeItem) => {
    const state = useCompositionStore.getState();
    const selectedText = item.value ?? item.text;

    // Fetch next predictions for the continued path
    const nextPredictions = await getPredictions(
      state.intent ?? '',
      [...state.slots, selectedText],
      'object',
      getTimeOfDay(),
      [],
      [],
    );

    useCompositionStore.getState().advance(selectedText, nextPredictions);
  }, []);

  // Left swipe: backtrack or diverge
  const handleBacktrack = useCallback(() => {
    useCompositionStore.getState().backtrack();
  }, []);

  const handleDiverge = useCallback(async () => {
    const state = useCompositionStore.getState();
    // Record current path as tried
    const currentPath = [state.intent ?? '', ...state.slots];
    state.recordTriedPath(currentPath);

    // Fetch divergent predictions — pass current phrase context so Claude
    // understands what's been built, plus triedPaths to avoid repeats
    // Re-read state after recordTriedPath to get the freshly recorded path
    const freshState = useCompositionStore.getState();
    freshState.setLoading(true);
    try {
      const items = await getPredictions(
        freshState.intent ?? '',
        freshState.slots,
        'object',
        getTimeOfDay(),
        [],
        [],
        freshState.triedPaths,
      );
      useCompositionStore.getState().setPredictions(items);
    } finally {
      useCompositionStore.getState().setLoading(false);
    }
  }, []);

  // Single tap: cycle modifiers on focused item
  const handleModifierTap = useCallback(async (item: ComposeItem) => {
    const state = useCompositionStore.getState();
    if (state.modifierState && state.modifierState.targetItem === item.text) {
      // Already cycling — advance to next modifier
      state.cycleModifier();
    } else {
      // First tap — fetch modifiers
      try {
        const modifiers = await getModifiers(
          state.intent ?? '',
          state.slots,
          item.text,
        );
        state.setModifiers(item.text, modifiers.length > 0 ? modifiers : FALLBACK_MODIFIERS);
      } catch {
        state.setModifiers(item.text, FALLBACK_MODIFIERS);
      }
    }
  }, []);

  const handlePhraseSave = useCallback(() => {
    // Task 13: save to saved_phrases
  }, []);

  const handlePhraseNavigateUp = useCallback(() => {
    setSection('compose');
  }, []);

  return (
    <SectionLayout
      headerContent={
        <IntentSection
          onNavigateHome={handleNavigateHome}
          timeOfDay={getTimeOfDay()}
          collapsed={intentCollapsed}
          onExpand={() => setIntentCollapsed(false)}
          initialIntent={intent ?? undefined}
        />
      }
      itemsContent={
        <ComposeSection
          onAdvance={handleAdvance}
          onBacktrack={handleBacktrack}
          onDiverge={handleDiverge}
          onModifierTap={handleModifierTap}
        />
      }
      onPhraseSave={handlePhraseSave}
      onPhraseNavigateUp={handlePhraseNavigateUp}
    />
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx tsc --noEmit 2>&1 | tail -20`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/compose.tsx
git commit -m "feat: rewrite compose screen with pre-loading, advance/backtrack, and modifier cycling"
```

---

### Task 9: Build home screen with WheelPicker launchpad

**Files:**
- Create: `components/home/StarterCard.tsx`
- Modify: `app/(app)/index.tsx`

- [ ] **Step 1: Create `components/home/StarterCard.tsx`**

Item renderer for the home screen WheelPicker:

```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LAYOUT } from '../../constants/config';
import type { WheelPickerItem } from '../../types';

interface StarterCardProps {
  item: WheelPickerItem;
  isFocused: boolean;
  modifierText?: string | null;
}

export function StarterCard({ item, isFocused, modifierText }: StarterCardProps) {
  const displayText = modifierText ?? item.text;

  return (
    <View style={styles.content}>
      <Text style={[
        styles.typeLabel,
        isFocused && styles.focusedLabel,
      ]}>
        {item.itemType === 'prediction' ? 'Predicted' : item.itemType === 'common' ? 'Common' : 'Saved'}
      </Text>
      <Text
        style={[
          isFocused ? styles.focusedText : styles.text,
        ]}
        numberOfLines={2}
      >
        {displayText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B6B6B',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  focusedLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  text: {
    fontSize: LAYOUT.wheelPickerItemFontSize,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  focusedText: {
    fontSize: LAYOUT.wheelPickerFocusedFontSize,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
```

- [ ] **Step 2: Rewrite `app/(app)/index.tsx`**

Replace FlowCard grid with WheelPicker launchpad:

```typescript
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WheelPicker } from '../../components/shared/WheelPicker';
import { StarterCard } from '../../components/home/StarterCard';
import { ErrorBoundary } from '../../components/shared/ErrorBoundary';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import { getPredictions, getModifiers } from '../../services/predictions';
import { INTENTS, DEFAULT_INTENT_BY_TIME } from '../../constants/intents';
import { FALLBACK_MODIFIERS } from '../../constants/fallbacks';
import { LAYOUT } from '../../constants/config';
import { supabase } from '../../services/supabase';
import { generateId } from '../../types';
import type { GestureAction, WheelPickerItem, CommonItem, SavedPhrase } from '../../types';

export default function HomeScreen() {
  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [commonItems, setCommonItems] = useState<CommonItem[]>([]);
  const [savedPhrases, setSavedPhrases] = useState<SavedPhrase[]>([]);
  const modifierState = useCompositionStore((s) => s.modifierState);

  // Fetch common items and saved phrases on mount
  useEffect(() => {
    async function loadData() {
      const [commonResult, savedResult] = await Promise.all([
        supabase.from('common_items').select('*').order('sort_order'),
        supabase.from('saved_phrases').select('*').order('sort_order'),
      ]);
      if (commonResult.data) setCommonItems(commonResult.data);
      if (savedResult.data) setSavedPhrases(savedResult.data);
    }
    loadData();
  }, []);

  // Build unified card list: predicted intents + common items + saved phrases
  const starterCards: WheelPickerItem[] = useMemo(() => {
    const timeOfDay = getTimeOfDay();
    const defaultIdx = DEFAULT_INTENT_BY_TIME[timeOfDay] ?? 0;

    // Predicted intents — reordered so time-relevant is first
    const intentCards: WheelPickerItem[] = INTENTS.map((intent, i) => ({
      id: `intent-${i}`,
      text: intent.text,
      itemType: 'prediction' as const,
      color: '#E07B2E',
      metadata: { addsToPhrase: intent.addsToPhrase, originalIndex: i },
    }));
    // Move the default intent to the front
    if (defaultIdx > 0 && defaultIdx < intentCards.length) {
      const [defaultCard] = intentCards.splice(defaultIdx, 1);
      intentCards.unshift(defaultCard);
    }

    // Common items — resolve dynamic values
    const commonCards: WheelPickerItem[] = commonItems.map((item) => {
      const resolvedValue = item.is_dynamic && item.value === '[Today]'
        ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        : item.value;
      return {
        id: `common-${item.id}`,
        text: item.label || resolvedValue,
        itemType: 'common' as const,
        color: '#2B7A78',
        metadata: { value: resolvedValue, label: item.label, category: item.category },
      };
    });

    // Saved phrases
    const savedCards: WheelPickerItem[] = savedPhrases.map((phrase) => ({
      id: `saved-${phrase.id}`,
      text: phrase.text,
      itemType: 'saved' as const,
      color: '#7B68AE',
      metadata: { category: phrase.category },
    }));

    // Interleave: predicted first, then common, then saved
    return [...intentCards, ...commonCards, ...savedCards];
  }, [commonItems, savedPhrases]);

  const handleGesture = useCallback(
    async (gesture: GestureAction, item: WheelPickerItem, index: number) => {
      if (gesture.type === 'double-tap') {
        // Select card and navigate to compose with pre-loaded context
        const store = useCompositionStore.getState();

        if (item.itemType === 'prediction') {
          // Pre-load intent and start fetching predictions
          const intentText = item.text;
          store.preload(intentText, []);
          store.setLoading(true);

          // Fire prediction fetch (compose will pick up results from store)
          getPredictions(intentText, [], 'object', getTimeOfDay(), [], [])
            .then((predictions) => {
              useCompositionStore.getState().setPredictions(predictions);
            })
            .finally(() => {
              useCompositionStore.getState().setLoading(false);
            });

          router.push({ pathname: '/(app)/compose', params: { type: 'prediction', value: intentText } } as never);
        } else if (item.itemType === 'common') {
          const value = (item.metadata?.value as string) ?? item.text;
          store.preloadCommonItem(value);

          // Fetch predictions for what comes after this common item
          getPredictions('', [value], 'object', getTimeOfDay(), [], [])
            .then((predictions) => {
              useCompositionStore.getState().setPredictions(predictions);
            })
            .finally(() => {
              useCompositionStore.getState().setLoading(false);
            });

          router.push({ pathname: '/(app)/compose', params: { type: 'common', value } } as never);
        } else if (item.itemType === 'saved') {
          store.preloadSavedPhrase(item.text);
          router.push({ pathname: '/(app)/compose', params: { type: 'saved', value: item.text } } as never);
        }
      } else if (gesture.type === 'tap') {
        // Modifier cycling on focused card
        const store = useCompositionStore.getState();
        if (store.modifierState && store.modifierState.targetItem === item.text) {
          store.cycleModifier();
        } else {
          try {
            const modifiers = await getModifiers('', [], item.text);
            store.setModifiers(item.text, modifiers.length > 0 ? modifiers : FALLBACK_MODIFIERS);
          } catch {
            store.setModifiers(item.text, FALLBACK_MODIFIERS);
          }
        }
      }
      // Left/right swipe: no-op on home screen
    },
    [router],
  );

  const renderItem = useCallback(
    (item: WheelPickerItem, isFocused: boolean) => {
      const modText = isFocused && modifierState?.targetItem === item.text
        ? useCompositionStore.getState().getModifierDisplayText()
        : null;
      return <StarterCard item={item} isFocused={isFocused} modifierText={modText} />;
    },
    [modifierState],
  );

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>DARE VOCEM</Text>
        <WheelPicker
          items={starterCards}
          focusedIndex={focusedIndex}
          onFocusChange={setFocusedIndex}
          onGesture={handleGesture}
          renderItem={renderItem}
        />
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: 6,
    textAlign: 'center',
    marginVertical: 24,
  },
});
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx tsc --noEmit 2>&1 | tail -20`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add components/home/StarterCard.tsx app/\(app\)/index.tsx
git commit -m "feat: rebuild home screen as WheelPicker launchpad with color-coded cards"
```

---

### Task 10: Run full test suite and fix any regressions

**Files:**
- Possibly modify: any files with test failures

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest --no-coverage 2>&1`
Expected: All tests pass. If any fail, fix them.

- [ ] **Step 2: Fix any test failures**

Update tests that relied on old ComposeSection props (`onRefine`, `onModify`) or old focus store defaults (`'intent'`).

- [ ] **Step 3: Run tests again to confirm**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx jest --no-coverage 2>&1 | tail -20`
Expected: All tests PASS.

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix: update tests for UX flow redesign changes"
```

---

### Task 11: Manual smoke test on device

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `cd /Users/zkhowes/Documents/GitHub/darevocem && npx expo start`

- [ ] **Step 2: Verify home screen**

Open in Expo Go. Verify:
- "DARE VOCEM" title shows
- WheelPicker shows color-coded cards (orange predicted, teal common, purple saved)
- Focused card is larger with colored fill
- Other cards are readable with colored left border
- Swiping up/down scrolls and changes focus
- Time-relevant intent is focused initially

- [ ] **Step 3: Verify compose pre-loading**

Double-tap a predicted intent (e.g., "I need"). Verify:
- Compose screen opens
- Intent already in phrase bar
- Predictions loaded (or shimmer while loading)
- WheelPicker shows predictions with focused first item

- [ ] **Step 4: Verify right/left swipe navigation**

Right-swipe a prediction. Verify:
- Item added to phrase
- New predictions loaded
Left-swipe. Verify:
- Previous predictions restored
- Item removed from phrase

- [ ] **Step 5: Verify modifier cycling**

Single-tap a focused prediction. Verify:
- Modifier appears (e.g., "coffee and")
- Subsequent taps cycle ("coffee or", "coffee with")
- Left swipe clears modifier

- [ ] **Step 6: Verify saved phrase entry**

Go back to home, double-tap a saved phrase. Verify:
- Compose opens with full phrase in phrase bar
- Focus on PhraseSection

- [ ] **Step 7: Document any issues found**

If bugs are found, create follow-up tasks.
