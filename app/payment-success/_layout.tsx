import { Stack } from 'expo-router';

export default function PaymentSuccessLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}