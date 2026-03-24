import type { ThemeMode } from '../types';

export interface ThemeColors {
  background: string;
  surface: string;
  primaryAccent: string;
  primaryAccentFaded: string;
  focusIndicator: string;
  textPrimary: string;
  textSecondary: string;
  destructive: string;
  success: string;
  disabled: string;
  phraseBarBorder: string;
}

const lightColors: ThemeColors = {
  background: '#F5F5F0',
  surface: '#FFFFFF',
  primaryAccent: '#E07B2E',
  primaryAccentFaded: 'rgba(224, 123, 46, 0.15)',
  focusIndicator: '#2B7A78',
  textPrimary: '#1A1A1A',
  textSecondary: '#6B6B6B',
  destructive: '#C0392B',
  success: '#27AE60',
  disabled: '#D5D5D0',
  phraseBarBorder: '#2B7A78',
};

const darkColors: ThemeColors = {
  background: '#1A1A1A',
  surface: '#2A2A2A',
  primaryAccent: '#E8952E',
  primaryAccentFaded: 'rgba(232, 149, 46, 0.15)',
  focusIndicator: '#3AAFA9',
  textPrimary: '#F5F5F0',
  textSecondary: '#A0A0A0',
  destructive: '#C0392B',
  success: '#27AE60',
  disabled: '#3A3A3A',
  phraseBarBorder: '#3AAFA9',
};

export function getThemeColors(mode: ThemeMode): ThemeColors {
  return mode === 'dark' ? darkColors : lightColors;
}
