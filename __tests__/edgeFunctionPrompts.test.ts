/**
 * Tests for /identify mode dispatch and /predict suggest_phrase message
 * shaping. Locks in the response-shape contracts that the client services
 * depend on.
 */

import {
  selectIdentifyMode,
  buildSuggestPhraseUserMessage,
} from '../utils/edgeFunctionPrompts';

describe('selectIdentifyMode', () => {
  it('returns word dispatch with tight token budget for mode=word', () => {
    expect(selectIdentifyMode('word')).toEqual({
      mode: 'word',
      maxTokens: 30,
      systemPromptKind: 'word',
    });
  });

  it('returns drawing dispatch for mode=drawing', () => {
    expect(selectIdentifyMode('drawing')).toEqual({
      mode: 'drawing',
      maxTokens: 200,
      systemPromptKind: 'drawing',
    });
  });

  it('returns photo dispatch for mode=photo', () => {
    expect(selectIdentifyMode('photo')).toEqual({
      mode: 'photo',
      maxTokens: 200,
      systemPromptKind: 'photo',
    });
  });

  it('defaults to photo for unknown mode strings', () => {
    expect(selectIdentifyMode('letter')).toEqual({
      mode: 'photo',
      maxTokens: 200,
      systemPromptKind: 'photo',
    });
    expect(selectIdentifyMode('asdf')).toEqual({
      mode: 'photo',
      maxTokens: 200,
      systemPromptKind: 'photo',
    });
  });

  it('defaults to photo when mode is null or undefined', () => {
    expect(selectIdentifyMode(null)).toEqual({
      mode: 'photo',
      maxTokens: 200,
      systemPromptKind: 'photo',
    });
    expect(selectIdentifyMode(undefined)).toEqual({
      mode: 'photo',
      maxTokens: 200,
      systemPromptKind: 'photo',
    });
  });
});

describe('buildSuggestPhraseUserMessage', () => {
  it('builds the home (time-of-day) message when no compose context provided', () => {
    const msg = buildSuggestPhraseUserMessage({
      captured: 'coffee',
      timeOfDay: 'morning',
    });
    expect(msg).toContain('Home context');
    expect(msg).toContain('coffee');
    expect(msg).toContain('morning');
    expect(msg).toContain('complete sentence');
  });

  it('uses default "morning" when timeOfDay is missing', () => {
    const msg = buildSuggestPhraseUserMessage({ captured: 'coffee' });
    expect(msg).toContain('Time of day: morning');
  });

  it('builds the compose (intent + partial phrase) message when intent provided', () => {
    const msg = buildSuggestPhraseUserMessage({
      captured: 'flower',
      intent: 'I want',
      fullPhrase: 'I want',
    });
    expect(msg).toContain('Compose context');
    expect(msg).toContain('flower');
    expect(msg).toContain('I want');
    expect(msg).toContain('short continuation');
  });

  it('falls back to captured text in partial phrase when intent and fullPhrase both empty', () => {
    const msg = buildSuggestPhraseUserMessage({
      captured: 'water',
      intent: '',
      fullPhrase: '',
    });
    // Empty compose context = home flow
    expect(msg).toContain('Home context');
    expect(msg).not.toContain('Compose context');
  });

  it('uses compose flow when only fullPhrase is provided', () => {
    const msg = buildSuggestPhraseUserMessage({
      captured: 'coffee',
      fullPhrase: 'I want some',
    });
    expect(msg).toContain('Compose context');
    expect(msg).toContain('I want some');
  });

  it('renders intent as "(none)" in compose mode when only fullPhrase is given', () => {
    const msg = buildSuggestPhraseUserMessage({
      captured: 'coffee',
      fullPhrase: 'Today',
    });
    expect(msg).toContain('Current intent: (none)');
  });

  it('trims surrounding whitespace from captured input', () => {
    const msg = buildSuggestPhraseUserMessage({
      captured: '   hi   ',
      timeOfDay: 'morning',
    });
    expect(msg).toContain('"hi"');
    expect(msg).not.toContain('"   hi   "');
  });
});
