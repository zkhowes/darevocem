import { File, Paths } from 'expo-file-system';
import { getEdgeAuthToken } from './edgeAuth';

declare const __DEV__: boolean;

// Handwriting OCR for the canvas overlay. Two functions:
//   - recognizeWord(base64) — reads a whole word the user wrote on the
//     canvas in one Claude vision call. The previous per-letter native-OCR
//     path was removed: Apple's VNRecognizeTextRequest reliably returns
//     empty for isolated finger-drawn glyphs, and per-letter latency
//     multiplied by word length makes the Claude fallback too slow. One
//     call per whole word lands in ~1-1.5s and is far more accurate.
//   - recognizeDrawing(base64, ctx) — drawing-mode interpretation. Routes
//     to /identify mode=drawing so Claude reads the sketch as a pictogram.
//
// Both take a base64 PNG (no data: prefix) produced from the Skia canvas.
//
// IMPORTANT: when sending the PNG to /identify, we write it to a temp file
// first and pass `uri: file:///...` in FormData. React Native's multipart
// serializer silently hangs forever on a `data:` URI — it treats the value
// as a file path to read from disk, never fetching the inline base64.

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Write a base64 PNG to a temp file and return its File handle. The caller
 * MUST delete the file after use (or let cache cleanup reclaim it). Returns
 * null on write failure so callers can short-circuit.
 *
 * We use a stable per-call filename with a timestamp so two concurrent
 * recognitions don't collide.
 */
function writeBase64ToTempPng(base64: string, prefix: string): File | null {
  try {
    const filename = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.png`;
    const file = new File(Paths.cache, filename);
    file.create();
    file.write(base64, { encoding: 'base64' });
    return file;
  } catch (err) {
    if (__DEV__) console.log('[handwriting] temp file write failed:', err);
    return null;
  }
}

/**
 * Recognize a handwritten word from a base64-encoded PNG snapshot of the
 * canvas. One Claude vision call. Returns empty string when the word is
 * unreadable so the caller can show a retry hint.
 */
export async function recognizeWord(base64Png: string): Promise<string> {
  const start = Date.now();
  const file = writeBase64ToTempPng(base64Png, 'word');
  if (!file) return '';

  try {
    const formData = new FormData();
    formData.append('image', {
      uri: file.uri,
      type: 'image/png',
      name: 'word.png',
    } as unknown as Blob);
    formData.append('mode', 'word');

    const token = await getEdgeAuthToken();
    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/identify`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const result = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!result.ok) {
        if (__DEV__) console.log(`[handwriting] /identify word ${result.status}`);
        return '';
      }

      const data = await result.json();
      const word = (data?.word ?? '').toString().trim();
      if (__DEV__) console.log(`[handwriting] recognize word ${Date.now() - start}ms -> "${word}"`);
      return word;
    } catch (err) {
      clearTimeout(timeout);
      if (__DEV__) console.log('[handwriting] word recognize error:', err);
      return '';
    }
  } finally {
    try { file.delete(); } catch { /* ignore */ }
  }
}

export interface DrawingResult {
  literal: string;     // "flower"
  contextual: string;  // "to look at the flowers"
  alternatives: string[];
}

/**
 * Interpret a finger-drawn sketch as a concept. Sends the PNG to /identify with
 * mode=drawing so Claude reads it as a pictogram (not a photo). Caller passes
 * current intent and partial phrase so the contextual completion grammatically
 * extends the sentence.
 *
 * Returns a graceful "something" result on failure rather than throwing — the
 * caller still has to insert P0, and an empty/failed recognition shouldn't
 * blank the screen.
 */
export async function recognizeDrawing(
  base64Png: string,
  ctx?: { intent?: string | null; fullPhrase?: string },
): Promise<DrawingResult> {
  const start = Date.now();
  const file = writeBase64ToTempPng(base64Png, 'drawing');
  if (!file) {
    return { literal: 'something', contextual: 'something', alternatives: [] };
  }

  try {
    const formData = new FormData();
    formData.append('image', {
      uri: file.uri,
      type: 'image/png',
      name: 'drawing.png',
    } as unknown as Blob);
    formData.append('mode', 'drawing');
    if (ctx?.intent) formData.append('intent', ctx.intent);
    if (ctx?.fullPhrase) formData.append('fullPhrase', ctx.fullPhrase);

    const token = await getEdgeAuthToken();
    const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/identify`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const result = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!result.ok) {
        if (__DEV__) console.log(`[handwriting] /identify drawing ${result.status}`);
        return { literal: 'something', contextual: 'something', alternatives: [] };
      }

      const data = await result.json();
      const literal = (data.literal ?? 'something').toString().trim();
      const contextual = (data.contextual ?? literal).toString().trim();
      const alternatives = Array.isArray(data.alternatives) ? data.alternatives.filter(Boolean) : [];
      if (__DEV__) console.log(`[handwriting] recognize drawing ${Date.now() - start}ms -> "${literal}" / "${contextual}"`);
      return { literal, contextual, alternatives };
    } catch (err) {
      clearTimeout(timeout);
      if (__DEV__) console.log('[handwriting] drawing recognize error:', err);
      return { literal: 'something', contextual: 'something', alternatives: [] };
    }
  } finally {
    try { file.delete(); } catch { /* ignore */ }
  }
}
