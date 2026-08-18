import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type { OneTapResponse } from 'react-native-nitro-google-signin';
import {
  GoogleSignInConfigurationError,
  resolveGoogleSignInConfig,
  type GoogleSignInPlatform,
} from './googleSignInConfig';

export type NativeGoogleSignInResult =
  | { status: 'success'; idToken: string; nonce: string }
  | { status: 'cancelled' };

function getNativePlatform(): GoogleSignInPlatform {
  if (Platform.OS === 'android' || Platform.OS === 'ios') return Platform.OS;
  throw new GoogleSignInConfigurationError(
    'Native Google sign-in is only available on Android and iOS.',
  );
}

function getPublicConfig(platform: GoogleSignInPlatform) {
  return resolveGoogleSignInConfig(platform, {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
}

async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

export async function startNativeGoogleSignIn(): Promise<NativeGoogleSignInResult> {
  const platform = getNativePlatform();
  const config = getPublicConfig(platform);
  const nonce = await createNonce();
  const google = await import('react-native-nitro-google-signin');

  google.GoogleOneTapSignIn.configure({
    webClientId: config.webClientId,
    iosClientId: config.iosClientId,
    nonce: nonce.hashed,
    offlineAccess: false,
    scopes: [],
    autoSelectOnSignIn: false,
  });

  await google.GoogleOneTapSignIn.checkPlayServices(true);

  // This function is called from an explicit "Continue with Google" button.
  // Use Google's button flow so Android shows every account on the device
  // (plus Add account), rather than filtering to credentials previously used
  // with Khushu.
  const response: OneTapResponse = await google.GoogleOneTapSignIn.presentExplicitSignIn();

  if (google.isCancelledResponse(response)) return { status: 'cancelled' };
  if (!google.isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google did not return an ID token.');
  }

  return {
    status: 'success',
    idToken: response.data.idToken,
    nonce: nonce.raw,
  };
}

export async function clearNativeGoogleSignInSession(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;

  const config = getPublicConfig(Platform.OS);
  const google = await import('react-native-nitro-google-signin');
  google.GoogleOneTapSignIn.configure({
    webClientId: config.webClientId,
    iosClientId: config.iosClientId,
    offlineAccess: false,
    scopes: [],
    autoSelectOnSignIn: false,
  });
  await google.GoogleOneTapSignIn.signOut();
}
