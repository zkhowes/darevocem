import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth';
import { supabase } from '../services/supabase';
import { LAYOUT } from '../constants/config';
import { buildSavedPhrasesFromProfile } from '../utils/profileSeeding';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateSpoken(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

export default function OnboardingScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateOfBirth(formatDateSpoken(selectedDate));
    }
  };

  const handleSave = async () => {
    if (!session?.user?.id) return;

    setSaving(true);
    setError(null);

    try {
      const userId = session.user.id;
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null;

      // Update profile — all fields optional
      // Try with emergency fields first; fall back if migration 003 not yet applied
      const baseFields: Record<string, unknown> = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        date_of_birth: dateOfBirth.trim() || null,
        phone: phone.trim() || null,
        home_address: homeAddress.trim() || null,
        display_name: displayName,
        onboarding_complete: true,
      };
      const fullFields = {
        ...baseFields,
        emergency_contact: emergencyContact.trim() || null,
        emergency_phone: emergencyPhone.trim() || null,
      };

      let result = await supabase.from('profiles').update(fullFields).eq('id', userId);
      if (result.error?.message?.includes('emergency_contact') || result.error?.message?.includes('emergency_phone')) {
        result = await supabase.from('profiles').update(baseFields).eq('id', userId);
      }
      if (result.error) throw result.error;

      // Seed saved phrases from profile data (label + value columns)
      const profileData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth.trim(),
        phone: phone.trim(),
        homeAddress: homeAddress.trim(),
        emergencyContact: emergencyContact.trim(),
        emergencyPhone: emergencyPhone.trim(),
      };

      const savedPhrases = buildSavedPhrasesFromProfile(userId, profileData);

      if (savedPhrases.length > 0) {
        const { error: phraseError } = await supabase
          .from('saved_phrases')
          .insert(savedPhrases);
        if (phraseError) throw phraseError;
      }

      // Refresh profile in auth store
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        useAuthStore.setState({
          profile: {
            id: data.id,
            role: data.role,
            displayName: data.display_name,
            firstName: data.first_name,
            lastName: data.last_name,
            dateOfBirth: data.date_of_birth,
            phone: data.phone,
            homeAddress: data.home_address,
            emergencyContact: data.emergency_contact,
            emergencyPhone: data.emergency_phone,
            onboardingComplete: true,
          },
        });
      }

      router.replace('/(app)' as never);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>
            Tell us about yourself. Everything is optional — fill in what you can. This information becomes phrases you can speak quickly.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              autoCapitalize="words"
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last name"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Date of Birth</Text>
            <Pressable
              style={styles.input}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={dateOfBirth ? styles.inputText : styles.placeholderText}>
                {dateOfBirth || 'Tap to select date'}
              </Text>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={new Date(1981, 11, 29)}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                maximumDate={new Date()}
              />
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Home Address</Text>
            <TextInput
              style={styles.input}
              value={homeAddress}
              onChangeText={setHomeAddress}
              placeholder="123 Main St, City, State"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Emergency Contact</Text>
            <TextInput
              style={styles.input}
              value={emergencyContact}
              onChangeText={setEmergencyContact}
              placeholder="Name of emergency contact"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Emergency Phone</Text>
            <TextInput
              style={styles.input}
              value={emergencyPhone}
              onChangeText={setEmergencyPhone}
              placeholder="(555) 987-6543"
              keyboardType="phone-pad"
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.buttonText}>
              {saving ? 'Saving...' : 'Continue'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  flex: { flex: 1 },
  scroll: {
    padding: LAYOUT.screenPadding,
    paddingTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B6B6B',
    marginBottom: 32,
    lineHeight: 22,
  },
  field: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#D5D5D0',
  },
  error: {
    color: '#C0392B',
    fontSize: 14,
    marginBottom: 12,
  },
  inputText: {
    fontSize: 18,
    color: '#1A1A1A',
  },
  placeholderText: {
    fontSize: 18,
    color: '#A0A0A0',
  },
  button: {
    backgroundColor: '#E07B2E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 40,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
