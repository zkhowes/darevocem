import { useFocusStore } from '../stores/focus';

// Reset store to initial state before each test
beforeEach(() => {
  useFocusStore.getState().reset();
  useFocusStore.getState().setComposeListSize(3); // default list size for navigation tests
});

describe('FocusStore — initial state', () => {
  it('starts in intent section at index 0', () => {
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('intent');
    expect(composeIndex).toBe(0);
  });
});

describe('FocusStore — moveDown', () => {
  it('moves from intent -> compose at index 0', () => {
    useFocusStore.getState().moveDown();
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });

  it('increments index when already in compose and not at last item', () => {
    useFocusStore.getState().moveDown(); // intent -> compose[0]
    useFocusStore.getState().moveDown(); // compose[0] -> compose[1]
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(1);
  });

  it('moves from last compose item -> phrase', () => {
    useFocusStore.getState().moveDown(); // intent -> compose[0]
    useFocusStore.getState().moveDown(); // compose[0] -> compose[1]
    useFocusStore.getState().moveDown(); // compose[1] -> compose[2]
    useFocusStore.getState().moveDown(); // compose[2] (last) -> phrase
    const { section } = useFocusStore.getState();
    expect(section).toBe('phrase');
  });
});

describe('FocusStore — moveUp', () => {
  it('moves from compose index 0 -> intent', () => {
    useFocusStore.getState().moveDown(); // intent -> compose[0]
    useFocusStore.getState().moveUp();   // compose[0] -> intent
    const { section } = useFocusStore.getState();
    expect(section).toBe('intent');
  });

  it('decrements index when in compose above index 0', () => {
    useFocusStore.getState().moveDown(); // intent -> compose[0]
    useFocusStore.getState().moveDown(); // compose[0] -> compose[1]
    useFocusStore.getState().moveUp();   // compose[1] -> compose[0]
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });

  it('moves from phrase -> compose, restoring previous index', () => {
    useFocusStore.getState().moveDown(); // intent -> compose[0]
    useFocusStore.getState().moveDown(); // compose[0] -> compose[1]
    useFocusStore.getState().moveDown(); // compose[1] -> compose[2]
    useFocusStore.getState().moveDown(); // compose[2] -> phrase (stores previousComposeIndex = 2)
    useFocusStore.getState().moveUp();   // phrase -> compose[2]
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(2);
  });
});

describe('FocusStore — setComposeIndex', () => {
  it('sets a specific index directly', () => {
    useFocusStore.getState().moveDown(); // enter compose
    useFocusStore.getState().setComposeIndex(2);
    const { composeIndex } = useFocusStore.getState();
    expect(composeIndex).toBe(2);
  });
});

describe('FocusStore — reset', () => {
  it('returns to initial state', () => {
    useFocusStore.getState().moveDown();
    useFocusStore.getState().moveDown();
    useFocusStore.getState().reset();
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('intent');
    expect(composeIndex).toBe(0);
  });
});
