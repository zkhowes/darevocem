import { supabase } from './supabase';

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

/**
 * Send a photo to the /identify edge function for object recognition.
 * Returns a short description of what's in the image (e.g., "dog", "coffee cup").
 */
export async function identifyImage(imageUri: string): Promise<string> {
  // Read image as base64
  const response = await fetch(imageUri);
  const blob = await response.blob();

  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'photo.jpg',
  } as unknown as Blob);

  const session = (await supabase.auth.getSession()).data.session;
  const functionUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/identify`;

  const result = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY}`,
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

  // Edge function returns { word: "dog", description: "a golden retriever" }
  return data.word ?? data.description ?? 'something';
}
