// Mock expo-speech before importing the service
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
  isSpeakingAsync: jest.fn(() => Promise.resolve(false)),
}));

import * as Speech from 'expo-speech';
import { speakPreview, cancelPreview, PREVIEW_DEBOUNCE_MS } from '../services/auditoryPreview';

const mockSpeak = Speech.speak as jest.Mock;
const mockStop = Speech.stop as jest.Mock;

// Helper: advance timers AND flush the microtask queue (for async callbacks in setTimeout)
async function advanceTimersAndFlush(ms: number) {
  jest.advanceTimersByTime(ms);
  // Flush the promise chain from the async setTimeout callback
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  mockSpeak.mockClear();
  mockStop.mockClear();
});

afterEach(() => {
  cancelPreview();
  jest.useRealTimers();
});

describe('Auditory preview — speakPreview', () => {
  it('speaks text after debounce delay', async () => {
    speakPreview('water');

    // Not called yet — debounce hasn't elapsed
    expect(mockSpeak).not.toHaveBeenCalled();

    // Advance past debounce and flush async
    await advanceTimersAndFlush(PREVIEW_DEBOUNCE_MS + 10);

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeak).toHaveBeenCalledWith('water', expect.objectContaining({
      rate: expect.any(Number),
      pitch: expect.any(Number),
      volume: expect.any(Number),
      language: 'en-US',
    }));
  });

  it('uses distinct preview voice config (faster, quieter, lower pitch)', async () => {
    speakPreview('coffee');
    await advanceTimersAndFlush(PREVIEW_DEBOUNCE_MS + 10);

    const config = mockSpeak.mock.calls[0][1];
    // Preview voice must be distinct from committed speech (rate 0.9)
    expect(config.rate).toBeGreaterThan(1.0);   // faster
    expect(config.volume).toBeLessThan(1.0);     // quieter
    expect(config.pitch).toBeLessThan(1.0);      // slightly lower
  });

  it('debounces rapid-fire calls (only last text is spoken)', async () => {
    speakPreview('water');
    speakPreview('coffee');
    speakPreview('help');

    await advanceTimersAndFlush(PREVIEW_DEBOUNCE_MS + 10);

    // Only the last call should have triggered speech
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeak).toHaveBeenCalledWith('help', expect.any(Object));
  });

  it('does not speak empty/whitespace text', async () => {
    speakPreview('');
    speakPreview('   ');

    await advanceTimersAndFlush(PREVIEW_DEBOUNCE_MS + 10);

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('stops previous speech before speaking new preview', async () => {
    speakPreview('water');
    await advanceTimersAndFlush(PREVIEW_DEBOUNCE_MS + 10);

    expect(mockStop).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalled();
  });
});

describe('Auditory preview — cancelPreview', () => {
  it('cancels a pending preview before it speaks', async () => {
    speakPreview('water');
    cancelPreview();

    await advanceTimersAndFlush(PREVIEW_DEBOUNCE_MS + 10);

    // Cancelled — should not have spoken
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('cancelPreview is safe to call when no preview is pending', () => {
    expect(() => cancelPreview()).not.toThrow();
  });
});

// ─── REGRESSION ──────────────────────────────────────────────────────────────

describe('REGRESSION — preview debounce timing', () => {
  it('debounce delay matches exported constant', () => {
    expect(PREVIEW_DEBOUNCE_MS).toBe(200);
  });

  it('preview does NOT speak before debounce completes', async () => {
    speakPreview('test');
    await advanceTimersAndFlush(PREVIEW_DEBOUNCE_MS - 1);
    expect(mockSpeak).not.toHaveBeenCalled();
  });
});
