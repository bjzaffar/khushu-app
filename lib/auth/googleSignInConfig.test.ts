import { describe, expect, it } from 'vitest';
import {
  getGoogleSignInErrorMessage,
  GoogleSignInConfigurationError,
  isGoogleSignInCancellation,
  resolveGoogleSignInConfig,
} from './googleSignInConfig';

const webClientId = '123456-web.apps.googleusercontent.com';
const iosClientId = '123456-ios.apps.googleusercontent.com';

describe('native Google sign-in configuration', () => {
  it('only requires the web client ID on Android', () => {
    expect(resolveGoogleSignInConfig('android', { webClientId })).toEqual({ webClientId });
  });

  it('requires both client IDs on iOS', () => {
    expect(resolveGoogleSignInConfig('ios', { webClientId, iosClientId })).toEqual({
      webClientId,
      iosClientId,
    });
    expect(() => resolveGoogleSignInConfig('ios', { webClientId })).toThrow(
      GoogleSignInConfigurationError,
    );
  });

  it('rejects malformed client IDs', () => {
    expect(() =>
      resolveGoogleSignInConfig('android', { webClientId: 'an-android-client-id' }),
    ).toThrow(GoogleSignInConfigurationError);
  });

  it('recognises cancellation without treating it as a failure', () => {
    expect(isGoogleSignInCancellation({ code: 'SIGN_IN_CANCELLED' })).toBe(true);
    expect(isGoogleSignInCancellation(new Error('cancelled'))).toBe(false);
  });

  it('turns common native failures into useful messages', () => {
    expect(getGoogleSignInErrorMessage({ code: 'DEVELOPER_ERROR' })).toContain(
      'not configured correctly',
    );
    expect(getGoogleSignInErrorMessage({ code: 'PLAY_SERVICES_NOT_AVAILABLE' })).toContain(
      'Google Play Services',
    );
  });
});
