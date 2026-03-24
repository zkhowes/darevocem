// Minimal mock for react-native — only what useGesture.ts imports
module.exports = {
  PanResponder: {
    create: jest.fn(() => ({ panHandlers: {} })),
  },
};
