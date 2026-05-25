import { getEdgeAuthToken } from './edgeAuth';

declare const __DEV__: boolean;

/**
 * Launch the camera, take a photo, and return its local URI.
 * Returns null if the user cancels.
 *
 * Uses dynamic import so expo-image-picker's native module doesn't crash
 * Expo Go at startup — it only loads when the user actually taps Camera.
 */
export async function takePhoto(): Promise<string | null> {
  let ImagePicker;
  try {
    ImagePicker = await import('expo-image-picker');
  } catch {
    // Native module not available (Expo Go) — requires a dev build
    throw new Error('Camera requires a dev build — not available in Expo Go');
  }

  // Guard against native module missing even after import resolves
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Camera permission not granted');
    }
  } catch (err) {
    if ((err as Error).message?.includes('native module')) {
      throw new Error('Camera requires a dev build — not available in Expo Go');
    }
    throw err;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    base64: true,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  return result.assets[0].uri;
}

export interface IdentifyResult {
  literal: string;       // "dog"
  contextual: string;    // "to pet the dog"
  alternatives: string[];
}

/**
 * Send a photo to the /identify edge function for object recognition.
 * Returns both a literal name ("dog") and a context-aware completion
 * ("to pet the dog") given the user's current intent and partial phrase.
 */
export async function identifyImage(
  imageUri: string,
  context?: { intent?: string; fullPhrase?: string },
): Promise<IdentifyResult> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'photo.jpg',
  } as unknown as Blob);
  if (context?.intent) formData.append('intent', context.intent);
  if (context?.fullPhrase) formData.append('fullPhrase', context.fullPhrase);

  const token = await getEdgeAuthToken();
  const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/identify`;

  const result = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!result.ok) {
    const errText = await result.text().catch(() => 'unknown');
    throw new Error(`/identify returned ${result.status}: ${errText.slice(0, 100)}`);
  }

  const data = await result.json();

  if (__DEV__) {
    console.log('[camera] Identify result:', JSON.stringify(data).slice(0, 200));
  }

  const literal = (data.literal ?? data.word ?? 'something').trim();
  const contextual = (data.contextual ?? data.description ?? literal).trim();
  const alternatives = Array.isArray(data.alternatives) ? data.alternatives.filter(Boolean) : [];

  return { literal, contextual, alternatives };
}
