import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth';
import { supabase } from '../services/supabase';
import { LAYOUT } from '../constants/config';

export default function OnboardingScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required');
      return;
    }
    if (!session?.user?.id) return;

    setSaving(true);
    setError(null);

    try {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          date_of_birth: dateOfBirth.trim() || null,
          phone: phone.trim() || null,
          home_address: homeAddress.trim() || null,
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          onboarding_complete: true,
        })
        .eq('id', session.user.id);

      if (profileError) throw profileError;

      // Seed saved phrases from profile data
      const savedPhrases: { user_id: string; text: string; category: string; sort_order: number }[] = [];
      const userId = session.user.id;

      savedPhrases.push({
        user_id: userId,
        text: `My name is ${firstName.trim()} ${lastName.trim()}`,
        category: 'personal',
        sort_order: 0,
      });

      if (dateOfBirth.trim()) {
        savedPhrases.push({
          user_id: userId,
          text: `My date of birth is ${dateOfBirth.trim()}`,
          category: 'personal',
          sort_order: 1,
        });
      }

      if (phone.trim()) {
        savedPhrases.push({
          user_id: userId,
          text: `My phone number is ${phone.trim()}`,
          category: 'personal',
          sort_order: 2,
        });
      }

      if (homeAddress.trim()) {
        savedPhrases.push({
          user_id: userId,
          text: `My address is ${homeAddress.trim()}`,
          category: 'personal',
          sort_order: 3,
        });
      }

      // Add a self-introduction phrase
      savedPhrases.push({
        user_id: userId,
        text: `My name is ${firstName.trim()} and I have Aphasia. I can have a hard time finding words but understand what you are saying. Thank you for your patience.`,
        category: 'introductions',
        sort_order: 0,
      });

      if (savedPhrases.length > 0) {
        const { error: phraseError } = await supabase
          .from('saved_phrases')
          .insert(savedPhrases);

        if (phraseError) throw phraseError;
      }

      // Seed common_items from profile data so the Common screen has personal info
      const commonItems: { user_id: string; label: string; value: string; category: string; is_dynamic: boolean; sort_order: number }[] = [];

      commonItems.push({
        user_id: userId,
        label: 'My name',
        value: `${firstName.trim()} ${lastName.trim()}`,
        category: 'Names',
        is_dynamic: false,
        sort_order: 0,
      });

      if (dateOfBirth.trim()) {
        commonItems.push({
          user_id: userId,
          label: 'DOB',
          value: dateOfBirth.trim(),
          category: 'Dates',
          is_dynamic: false,
          sort_order: 0,
        });
      }

      if (phone.trim()) {
        commonItems.push({
          user_id: userId,
          label: 'My phone',
          value: phone.trim(),
          category: 'Names',
          is_dynamic: false,
          sort_order: 1,
        });
      }

      if (homeAddress.trim()) {
        commonItems.push({
          user_id: userId,
          label: 'My address',
          value: homeAddress.trim(),
          category: 'Places',
          is_dynamic: false,
          sort_order: 0,
        });
      }

      if (commonItems.length > 0) {
        const { error: commonError } = await supabase
          .from('common_items')
          .insert(commonItems);

        if (commonError) throw commonError;
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
            Tell us a bit about yourself. This information will be saved as phrases you can quickly speak.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>First Name *</Text>
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
            <Text style={styles.label}>Last Name *</Text>
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
            <TextInput
              style={styles.input}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              placeholder="12/29/1981"
              keyboardType="numbers-and-punctuation"
            />
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
  button: {
    backgroundColor: '#E07B2E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
});
