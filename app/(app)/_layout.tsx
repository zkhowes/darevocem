import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="compose" options={{ gestureEnabled: false }} />
      <Stack.Screen name="common" options={{ gestureEnabled: false }} />
      <Stack.Screen name="saved" options={{ gestureEnabled: false }} />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
