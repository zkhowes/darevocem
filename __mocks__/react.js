// Minimal mock for react — only what useGesture.ts imports
module.exports = {
  useRef: jest.fn((val) => ({ current: val })),
  useCallback: jest.fn((fn) => fn),
  useMemo: jest.fn((fn) => fn()),
};
