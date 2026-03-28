import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/auth';
import { supabase } from '../../services/supabase';
import { LAYOUT, TYPOGRAPHY } from '../../constants/config';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format a Date as spoken text: "December 29 1981" */
function formatDateSpoken(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

/** Try to parse a spoken date string back into a Date object */
function parseDateString(str: string): Date | null {
  if (!str) return null;
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;
  return null;
}

/**
 * Editable profile screen.
 * Updates both the profiles table and the corresponding saved phrases
 * so the Personal category stays in sync.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);

  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.dateOfBirth ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [homeAddress, setHomeAddress] = useState(profile?.homeAddress ?? '');
  const [emergencyContact, setEmergencyContact] = useState(profile?.emergencyContact ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergencyPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Parse existing DOB for the date picker's initial value
  const datePickerValue = parseDateString(dateOfBirth) ?? new Date(1981, 11, 29);

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // iOS keeps picker open
    if (selectedDate) {
      setDateOfBirth(formatDateSpoken(selectedDate));
    }
  };

  const handleSave = async () => {
    if (!session?.user?.id) return;
    setSaving(true);

    try {
      const userId = session.user.id;
      const displayName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ') || null;

      // Update profile — try with new columns first, fall back without them
      // if the migration hasn't been applied yet
      const profileFields: Record<string, unknown> = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        date_of_birth: dateOfBirth.trim() || null,
        phone: phone.trim() || null,
        home_address: homeAddress.trim() || null,
        display_name: displayName,
      };

      // Try including emergency fields — if migration 003 hasn't been run,
      // this will fail, so we retry without them
      let profileError;
      const fullFields = {
        ...profileFields,
        emergency_contact: emergencyContact.trim() || null,
        emergency_phone: emergencyPhone.trim() || null,
      };

      const result = await supabase
        .from('profiles')
        .update(fullFields)
        .eq('id', userId);

      if (result.error?.message?.includes('emergency_contact') || result.error?.message?.includes('emergency_phone')) {
        // Migration not yet applied — save without emergency fields
        const fallback = await supabase
          .from('profiles')
          .update(profileFields)
          .eq('id', userId);
        profileError = fallback.error;
      } else {
        profileError = result.error;
      }

      if (profileError) throw profileError;

      // Delete old profile-sourced phrases and re-seed
      // Delete Personal category phrases
      const delPersonal = await supabase
        .from('saved_phrases')
        .delete()
        .eq('user_id', userId)
        .ilike('category', 'personal');
      if (delPersonal.error) {
        console.warn('Failed to delete Personal phrases:', delPersonal.error.message);
      }

      // Delete old aphasia intro phrase so we re-seed with updated name
      const delIntro = await supabase
        .from('saved_phrases')
        .delete()
        .eq('user_id', userId)
        .eq('category', 'Introductions')
        .like('text', '%Aphasia%');
      if (delIntro.error) {
        console.warn('Failed to delete intro phrase:', delIntro.error.message);
      }

      // Re-seed with current profile data
      const { buildSavedPhrasesFromProfile } = await import('../../utils/profileSeeding');
      const profileData = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth.trim(),
        phone: phone.trim(),
        homeAddress: homeAddress.trim(),
        emergencyContact: emergencyContact.trim(),
        emergencyPhone: emergencyPhone.trim(),
      };
      const newPhrases = buildSavedPhrasesFromProfile(userId, profileData);

      if (newPhrases.length > 0) {
        const { error: phraseError } = await supabase
          .from('saved_phrases')
          .insert(newPhrases);
        if (phraseError) {
          console.warn('Failed to insert phrases:', phraseError.message);
          throw phraseError;
        }
      }

      // Update common items — delete profile-sourced ones and re-seed
      const knownLabels = ['My name', 'DOB', 'My phone', 'My address', 'Emergency contact', 'Emergency phone'];
      await supabase
        .from('common_items')
        .delete()
        .eq('user_id', userId)
        .in('label', knownLabels);

      const { buildCommonItemsFromProfile } = await import('../../utils/profileSeeding');
      const newCommonItems = buildCommonItemsFromProfile(userId, profileData);

      if (newCommonItems.length > 0) {
        await supabase
          .from('common_items')
          .insert(newCommonItems);
      }

      // Refresh auth store with updated profile
      useAuthStore.setState({
        profile: {
          ...profile!,
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          dateOfBirth: dateOfBirth.trim() || null,
          phone: phone.trim() || null,
          homeAddress: homeAddress.trim() || null,
          emergencyContact: emergencyContact.trim() || null,
          emergencyPhone: emergencyPhone.trim() || null,
          displayName: displayName,
        },
      });

      router.back();
    } catch (err: unknown) {
      // Show the actual error so we can debug
      const message = err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : JSON.stringify(err);
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <Pressable onPress={handleSave} disabled={saving}>
          <Text style={[styles.saveText, saving && styles.saveDisabled]}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.hint}>
            Changes here update your saved phrases automatically.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First name"
              autoCapitalize="words"
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
                value={datePickerValue}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F0' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: LAYOUT.screenPadding, paddingVertical: 16,
  },
  backText: { fontSize: TYPOGRAPHY.navBar.size, color: '#2B7A78' },
  title: { fontSize: TYPOGRAPHY.phraseBar.size, fontWeight: '600', color: '#1A1A1A' },
  saveText: { fontSize: TYPOGRAPHY.navBar.size, fontWeight: '600', color: '#E07B2E' },
  saveDisabled: { opacity: 0.5 },
  scroll: {
    padding: LAYOUT.screenPadding,
    paddingBottom: 40,
  },
  hint: {
    fontSize: 14,
    color: '#6B6B6B',
    marginBottom: 24,
    lineHeight: 20,
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
  inputText: {
    fontSize: 18,
    color: '#1A1A1A',
  },
  placeholderText: {
    fontSize: 18,
    color: '#A0A0A0',
  },
});
