import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import type { Preferences, ThemeMode, DisplayDensity } from '../types';

const DEFAULTS: Preferences = {
  theme: 'light',
  textScale: 1.0,
  speechRate: 1.0,
  useSystemTtsOnly: false,
  showFallbackButtons: false,
  gestureConfig: {},
  auditoryPreview: true,    // ON by default — core accessibility feature
  displayDensity: 'standard',
};

interface PreferencesStore extends Preferences {
  setTheme: (theme: ThemeMode) => void;
  setTextScale: (scale: number) => void;
  setSpeechRate: (rate: number) => void;
  setUseSystemTtsOnly: (value: boolean) => void;
  setShowFallbackButtons: (value: boolean) => void;
  setAuditoryPreview: (value: boolean) => void;
  setDisplayDensity: (value: DisplayDensity) => void;
  syncFromSupabase: () => Promise<void>;
  syncToSupabase: () => Promise<void>;
}

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setTheme: (theme) => { set({ theme }); get().syncToSupabase(); },
      setTextScale: (textScale) => { set({ textScale }); get().syncToSupabase(); },
      setSpeechRate: (speechRate) => { set({ speechRate }); get().syncToSupabase(); },
      setUseSystemTtsOnly: (useSystemTtsOnly) => { set({ useSystemTtsOnly }); get().syncToSupabase(); },
      setShowFallbackButtons: (showFallbackButtons) => { set({ showFallbackButtons }); get().syncToSupabase(); },
      setAuditoryPreview: (auditoryPreview) => { set({ auditoryPreview }); get().syncToSupabase(); },
      setDisplayDensity: (displayDensity) => { set({ displayDensity }); get().syncToSupabase(); },

      syncFromSupabase: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase
          .from('preferences')
          .select('*')
          .eq('user_id', session.user.id)
          .single();
        if (data) {
          set({
            theme: data.theme ?? DEFAULTS.theme,
            textScale: data.text_scale ?? DEFAULTS.textScale,
            speechRate: data.speech_rate ?? DEFAULTS.speechRate,
            useSystemTtsOnly: data.use_system_tts_only ?? DEFAULTS.useSystemTtsOnly,
            showFallbackButtons: data.show_fallback_buttons ?? DEFAULTS.showFallbackButtons,
            gestureConfig: data.gesture_config ?? DEFAULTS.gestureConfig,
            auditoryPreview: data.auditory_preview ?? DEFAULTS.auditoryPreview,
            displayDensity: data.display_density ?? DEFAULTS.displayDensity,
          });
        }
      },

      syncToSupabase: async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const state = get();
        await supabase.from('preferences').upsert({
          user_id: session.user.id,
          theme: state.theme,
          text_scale: state.textScale,
          speech_rate: state.speechRate,
          use_system_tts_only: state.useSystemTtsOnly,
          show_fallback_buttons: state.showFallbackButtons,
          gesture_config: state.gestureConfig,
          auditory_preview: state.auditoryPreview,
          display_density: state.displayDensity,
          updated_at: new Date().toISOString(),
        });
      },
    }),
    {
      name: 'darevocem-preferences',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
