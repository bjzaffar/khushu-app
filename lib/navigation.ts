import { router } from 'expo-router';

/**
 * Leave a single tab navigator at the root of the stack.
 *
 * `replace('/(tabs)')` alone only replaces the current auth screen. When an
 * OAuth callback was pushed above the account screen, that left account or
 * onboarding routes underneath the new tabs and Android Back exposed them.
 */
export function resetToAppRoot(): void {
  router.dismissAll();
  router.replace('/(tabs)');
}
