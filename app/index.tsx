import { Redirect } from 'expo-router';
import { useAppStore } from '@/store/appStore';

export default function Index() {
  const { hasCompletedOnboarding } = useAppStore();
  return <Redirect href={hasCompletedOnboarding ? '/(tabs)' : '/onboarding'} />;
}
