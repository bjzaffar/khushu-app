import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import PostHog, { PostHogProvider } from 'posthog-react-native';

const apiKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim();

/**
 * The PostHog project API key is intentionally a public, client-side key.
 * Keep it in the local Expo environment so deployments can use their own
 * PostHog project without hard-coding a key in the app.
 */
export const posthog = apiKey
  ? new PostHog(apiKey, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://eu.i.posthog.com',
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
    })
  : null;

function ScreenTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) posthog?.screen(pathname);
  }, [pathname]);

  return null;
}

export function AnalyticsProvider({ children }: PropsWithChildren) {
  if (!posthog) return children;

  return (
    <PostHogProvider client={posthog}>
      <ScreenTracker />
      {children}
    </PostHogProvider>
  );
}

export function identifyAnalyticsUser(userId: string) {
  posthog?.identify(userId);
}

export function resetAnalyticsUser() {
  posthog?.reset();
}

export function captureAnalyticsEvent(
  event: string,
  properties?: Parameters<PostHog['capture']>[1],
) {
  posthog?.capture(event, properties);
}
