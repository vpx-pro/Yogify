import { Stack } from 'expo-router';

export default function WriteReviewLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[classId]" />
    </Stack>
  );
}