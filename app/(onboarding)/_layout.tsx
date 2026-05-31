import { Stack } from 'expo-router';
import { COLORS } from '@/constants/theme';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }} />
  );
}
