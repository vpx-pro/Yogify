import { Stack } from 'expo-router';

export default function ClassDetailLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}