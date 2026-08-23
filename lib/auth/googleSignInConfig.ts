export type GoogleSignInPlatform = 'android' | 'ios';

export type GoogleSignInEnvironment = {
  webClientId?: string;
  iosClientId?: string;
};

export type GoogleSignInConfig = {
  webClientId: string;
  iosClientId?: string;
};

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const GOOGLE_CLIENT_ID_PATTERN = /^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/;

export class GoogleSignInConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleSignInConfigurationError';
  }
}

function cleanClientId(value: string | undefined): string | undefined {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function assertGoogleClientId(value: string, label: string): void {
  if (!GOOGLE_CLIENT_ID_PATTERN.test(value)) {
    throw new GoogleSignInConfigurationError(
      `${label} must be a Google OAuth client ID ending in ${GOOGLE_CLIENT_ID_SUFFIX}.`,
    );
  }
}

export function resolveGoogleSignInConfig(
  platform: GoogleSignInPlatform,
  environment: GoogleSignInEnvironment,
): GoogleSignInConfig {
  const webClientId = cleanClientId(environment.webClientId);
  const iosClientId = cleanClientId(environment.iosClientId);

  if (!webClientId) {
    throw new GoogleSignInConfigurationError(
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing from this build.',
    );
  }
  assertGoogleClientId(webClientId, 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID');

  if (platform === 'ios') {
    if (!iosClientId) {
      throw new GoogleSignInConfigurationError(
        'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is missing from this iOS build.',
      );
    }
    assertGoogleClientId(iosClientId, 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID');
  }

  return {
    webClientId,
    ...(platform === 'ios' && iosClientId ? { iosClientId } : {}),
  };
}

export function isGoogleSignInCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SIGN_IN_CANCELLED'
  );
}

export function getGoogleSignInErrorMessage(error: unknown): string {
  if (error instanceof GoogleSignInConfigurationError) {
    return 'Google sign-in is not configured in this build. Please update the app or use email sign-in.';
  }

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;

  switch (code) {
    case 'PLAY_SERVICES_NOT_AVAILABLE':
      return 'Google Play Services is unavailable or out of date. Update it and try again.';
    case 'DEVELOPER_ERROR':
      return 'Google sign-in is not configured correctly for this version of the app.';
    case 'IN_PROGRESS':
      return 'Google sign-in is already in progress.';
    case 'ONE_TAP_START_FAILED':
      return 'Google sign-in could not be started. Please try again.';
  }

  const details = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/network request failed|failed to fetch|network error|offline|internet/i.test(details)) {
    return 'No internet connection';
  }
  if (/expo go|nitro|native module|hybrid object/i.test(details)) {
    return 'Google sign-in is not available in this version of Khushu. Install the latest development or store build, then try again.';
  }

  return 'Google sign-in could not be completed. Please try again.';
}
