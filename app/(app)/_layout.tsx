import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="compose" />
      <Stack.Screen name="common" />
      <Stack.Screen name="saved" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
