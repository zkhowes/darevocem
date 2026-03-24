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
    useFocusStore.getState().moveDown();
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(1);
  });

  it('moves from last compose item -> phrase', () => {
    useFocusStore.getState().setComposeIndex(2);
    useFocusStore.getState().moveDown();
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
    useFocusStore.getState().moveUp();
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });

  it('stays at compose index 0 when moveUp at top (screen handles navigation)', () => {
    useFocusStore.getState().moveUp();
    const { section, composeIndex } = useFocusStore.getState();
    expect(section).toBe('compose');
    expect(composeIndex).toBe(0);
  });

  it('moves from phrase -> compose, restoring previous index', () => {
    useFocusStore.getState().setComposeIndex(2);
    useFocusStore.getState().moveDown();
    useFocusStore.getState().moveUp();
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
