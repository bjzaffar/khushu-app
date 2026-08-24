import {
  View, Pressable, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { ArrowLeftIcon, CloudIcon, EnvelopeIcon, LockClosedIcon } from 'react-native-heroicons/outline';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase/client';
import { syncLogsFromCloud } from '@/lib/supabase/sync';
import * as SecureStore from 'expo-secure-store';
import { clearPendingAuthReturn, setPendingAuthReturn } from '@/lib/authReturn';
import { resetToAppRoot } from '@/lib/navigation';
import {
  getGoogleSignInErrorMessage,
  isGoogleSignInCancellation,
} from '@/lib/auth/googleSignInConfig';
import { startNativeGoogleSignIn } from '@/lib/auth/googleSignIn';
import { captureAnalyticsEvent } from '@/lib/analytics/posthog';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function markOnboardingComplete() {
  await SecureStore.setItemAsync('onboarding_complete', 'true');
}

type Tab = 'signin' | 'signup';
type Status = 'idle' | 'loading' | 'error' | 'confirm_email' | 'forgot_password' | 'link_sent';
type AuthenticationProvider = 'email' | 'google';

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" accessibilityLabel="Google">
      <Path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.797 2.716v2.259h2.909c1.703-1.568 2.684-3.874 2.684-6.615z" />
      <Path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.806.54-1.837.86-3.047.86-2.344 0-4.328-1.585-5.037-3.711H.956v2.333A9 9 0 0 0 9 18z" />
      <Path fill="#FBBC05" d="M3.963 10.71A5.41 5.41 0 0 1 3.682 9c0-.594.102-1.172.281-1.71V4.957H.956A9 9 0 0 0 0 9c0 1.453.348 2.83.956 4.043l3.007-2.333z" />
      <Path fill="#EA4335" d="M9 3.58c1.322 0 2.508.455 3.44 1.347l2.581-2.581C13.463.891 11.43 0 9 0A9 9 0 0 0 .956 4.957L3.963 7.29C4.672 5.165 6.656 3.58 9 3.58z" />
    </Svg>
  );
}

function isNetworkError(error: unknown): boolean {
  const details = error instanceof Error
    ? `${error.name} ${error.message} ${String((error as Error & { context?: unknown; cause?: unknown }).context)} ${String((error as Error & { cause?: unknown }).cause)}`
    : String(error);
  return /network request failed|failed to fetch|network error|offline|internet|functionsfetcherror|failed to send a request to the edge function/i.test(details);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  // "from=settings" means we came from Settings, not onboarding.
  // A guest upgrade returns here first, then resumes the authenticated paywall.
  const { from, returnTo } = useLocalSearchParams<{ from?: string; returnTo?: string }>();
  const isFromSettings = from === 'settings';

  const { setHasCompletedOnboarding, setUserId, requestSignInSuccessNotice } = useAppStore();

  const [tab, setTab]         = useState<Tab>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus]   = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmationLoading, setConfirmationLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ─── navigation ─────────────────────────────────────────────────────────────

  async function finishAsGuest() {
    if (!isFromSettings) {
      await markOnboardingComplete();
      captureAnalyticsEvent('onboarding completed', { account_type: 'guest' });
      setHasCompletedOnboarding(true);
      resetToAppRoot();
    } else {
      await clearPendingAuthReturn();
      router.back();
    }
  }

  async function onAuthSuccess(
    userId: string,
    provider: AuthenticationProvider,
    isNewAccount = false,
  ) {
    setUserId(userId);
    captureAnalyticsEvent(isNewAccount ? 'account created' : 'account signed in', { provider });
    // Make the authenticated user's SQLite cache match Supabase before they
    // return to the app. Offline sessions retain their current local cache
    // until the connectivity listener can complete this refresh.
    await syncLogsFromCloud(userId).catch((error) =>
      console.warn('[supabase] post-login log sync failed:', error)
    );
    await clearPendingAuthReturn();
    if (returnTo === 'paywall') {
      router.dismissTo('/paywall');
    } else if (!isFromSettings) {
      await markOnboardingComplete();
      captureAnalyticsEvent('onboarding completed', { account_type: 'registered' });
      setHasCompletedOnboarding(true);
      requestSignInSuccessNotice();
      resetToAppRoot();
    } else {
      requestSignInSuccessNotice();
      resetToAppRoot();
    }
  }

  // ─── email/password handlers ─────────────────────────────────────────────────

  async function handleCheckConfirmation() {
    setConfirmationLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: confirmEmail,
        password,
      });
      if (error) {
        setErrorMsg('Email not confirmed yet. Check your inbox and try again.');
        return;
      }
      const userId = data?.user?.id ?? data?.session?.user?.id;
      if (userId) await onAuthSuccess(userId, 'email', tab === 'signup');
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setConfirmationLoading(false);
    }
  }

  async function handleEmailAuth() {
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter your email and password.');
      setStatus('error');
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    setStatus('loading');
    setErrorMsg('');
    try {
      if (tab === 'signin') {
        const { data: checkData, error: checkError } = await supabase.functions.invoke(
          'check-email-exists',
          { body: { email: normalizedEmail } },
        );
        if (checkError) {
          setErrorMsg(isNetworkError(checkError) ? 'No internet connection' : 'Unable to check this account. Please try again.');
          setStatus('error');
          return;
        }
        if (!checkData?.exists) {
          setErrorMsg('Account does not exist');
          setStatus('error');
          return;
        }
      }

      const { data, error } = tab === 'signin'
        ? await supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        : await supabase.auth.signUp({ email: normalizedEmail, password });

      if (error) {
        setErrorMsg(
          tab === 'signin' && /invalid login credentials/i.test(error.message)
            ? 'Invalid password'
            : isNetworkError(error)
              ? 'No internet connection'
              : error.message
        );
        setStatus('error');
        return;
      }

      const userId = data?.session?.user?.id;
      if (userId) {
        await onAuthSuccess(userId, 'email', tab === 'signup');
      } else if (tab === 'signup') {
        if (returnTo === 'paywall') await setPendingAuthReturn('paywall');
        setConfirmEmail(normalizedEmail);
        setStatus('confirm_email');
      }
    } catch (error) {
      setErrorMsg(isNetworkError(error) ? 'No internet connection' : 'Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  // ─── Native Google handler ───────────────────────────────────────────────────

  async function handleGoogle() {
    setStatus('loading');
    setErrorMsg('');
    try {
      if (returnTo === 'paywall') await setPendingAuthReturn('paywall');

      const googleResult = await startNativeGoogleSignIn();
      if (googleResult.status === 'cancelled') {
        await clearPendingAuthReturn();
        setStatus('idle');
        return;
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: googleResult.idToken,
        nonce: googleResult.nonce,
      });
      if (error) throw error;
      const userId = data.user?.id ?? data.session?.user?.id;
      if (!userId) throw new Error('Supabase did not create a session after Google sign-in.');

      await onAuthSuccess(userId, 'google');
    } catch (error) {
      await clearPendingAuthReturn();
      if (isGoogleSignInCancellation(error)) {
        setStatus('idle');
        return;
      }
      setErrorMsg(getGoogleSignInErrorMessage(error));
      setStatus('error');
    }
  }

  // ─── forgot password handlers ────────────────────────────────────────────────

  async function handleSendResetLink() {
    if (!forgotEmail.trim()) {
      setErrorMsg('Please enter your email.');
      return;
    }
    setResetLoading(true);
    setErrorMsg('');
    try {
      const { data: checkData, error: checkError } = await supabase.functions.invoke(
        'check-email-exists',
        { body: { email: forgotEmail.trim() } },
      );
      if (checkError) {
        setErrorMsg(isNetworkError(checkError) ? 'No internet connection' : 'Unable to check this email. Please try again.');
        setResetLoading(false);
        return;
      }
      if (!checkData?.exists) {
        setErrorMsg('No account found with this email.');
        setResetLoading(false);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: 'khushuai://auth/callback',
      });
      if (error) {
        setErrorMsg(isNetworkError(error) ? 'No internet connection' : error.message);
        setResetLoading(false);
        return;
      }
      setStatus('link_sent');
    } catch (error) {
      setErrorMsg(isNetworkError(error) ? 'No internet connection' : 'Something went wrong. Please try again.');
    }
    setResetLoading(false);
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="flex-1 px-6 pt-6 pb-10 justify-between">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <View>
              {isFromSettings && (
                <Pressable onPress={() => router.back()} className="mb-4 self-start p-1 active:opacity-60">
                  <View className="flex-row items-center gap-x-1"><ArrowLeftIcon size={16} color="#5A7A5A" /><Text className="text-sage-600 text-sm font-medium">Back</Text></View>
                </Pressable>
              )}

              <View className="items-center gap-y-2 mb-8">
                <CloudIcon size={32} color="#5A7A5A" />
                <Text className="text-2xl font-semibold text-ink-900 text-center">
                  {isFromSettings ? 'Sign in' : 'Sync your reflections'}
                </Text>
                {!isFromSettings && (
                  <Text className="text-ink-300 text-sm text-center leading-relaxed mt-1">
                    Create an account to back up your logs and unlock Premium. You can always skip this.
                  </Text>
                )}
              </View>

              {/* ── Tab switcher ─────────────────────────────────────────── */}
              {status !== 'confirm_email' && (
              <View className="flex-row bg-sand-200 rounded-xl p-1 mb-6">
                {(['signin', 'signup'] as Tab[]).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => { setTab(t); setErrorMsg(''); setStatus('idle'); }}
                    className={`flex-1 py-2.5 rounded-lg items-center ${tab === t ? 'bg-white' : ''}`}
                  >
                    <Text className={`text-sm font-medium ${tab === t ? 'text-ink-900' : 'text-ink-300'}`}>
                      {t === 'signin' ? 'Sign in' : 'Create account'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              )}

              {/* ── Email confirmation screen ─────────────────────────────── */}
              {status === 'confirm_email' && (
                <View className="items-center gap-y-4 mb-6">
                  <View className="w-16 h-16 rounded-full bg-sage-100 items-center justify-center">
                    <EnvelopeIcon size={24} color="#5A7A5A" />
                  </View>
                  <Text className="text-ink-700 font-medium text-base text-center">
                    Check your email
                  </Text>
                  <Text className="text-ink-300 text-sm text-center leading-relaxed">
                    We sent a confirmation link to{'\n'}
                    <Text className="text-ink-700 font-medium">{confirmEmail}</Text>
                  </Text>
                  <Text className="text-ink-300 text-xs text-center leading-relaxed">
                    Click the link in the email, then come back and tap the button below.
                  </Text>
                  {errorMsg ? (
                    <Text className="text-red-400 text-xs text-center">{errorMsg}</Text>
                  ) : null}
                  <Pressable
                    onPress={handleCheckConfirmation}
                    disabled={confirmationLoading}
                    className="bg-sage-600 py-4 rounded-2xl items-center w-full active:bg-sage-700"
                  >
                    {confirmationLoading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text className="text-pure-white font-semibold text-base">I&apos;ve confirmed my email</Text>
                    }
                  </Pressable>
                  <Pressable
                    onPress={() => { setStatus('idle'); setErrorMsg(''); setPassword(''); }}
                    className="py-2"
                  >
                    <Text className="text-ink-300 text-sm">Use a different email</Text>
                  </Pressable>
                </View>
              )}

              {/* ── Forgot password: enter email ─────────────────────────── */}
              {status === 'forgot_password' && (
                <View className="items-center gap-y-4 mb-6">
                  <View className="w-16 h-16 rounded-full bg-sage-100 items-center justify-center">
                    <LockClosedIcon size={24} color="#5A7A5A" />
                  </View>
                  <Text className="text-ink-700 font-medium text-base text-center">
                    Reset your password
                  </Text>
                  <Text className="text-ink-300 text-sm text-center leading-relaxed">
                    Enter your email and we{'\''}ll send you a sign-in link.
                  </Text>
                  <TextInput
                    value={forgotEmail}
                    onChangeText={setForgotEmail}
                    placeholder="Email"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="bg-white border border-sand-200 rounded-xl px-4 py-3.5 text-ink-900 text-sm w-full"
                    placeholderTextColor="#B8A99A"
                  />
                  {errorMsg ? (
                    <Text className="text-red-400 text-xs text-center">{errorMsg}</Text>
                  ) : null}
                  <Pressable
                    onPress={handleSendResetLink}
                    disabled={resetLoading}
                    className="bg-sage-600 py-4 rounded-2xl items-center w-full active:bg-sage-700"
                  >
                    {resetLoading
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text className="text-pure-white font-semibold text-base">Send link</Text>
                    }
                  </Pressable>
                  <Pressable
                    onPress={() => { setStatus('idle'); setErrorMsg(''); setForgotEmail(''); }}
                    className="py-2"
                  >
                    <Text className="text-ink-300 text-sm">Back to sign in</Text>
                  </Pressable>
                </View>
              )}

              {/* ── Forgot password: link sent ────────────────────────────── */}
              {status === 'link_sent' && (
                <View className="items-center gap-y-4 mb-6">
                  <View className="w-16 h-16 rounded-full bg-sage-100 items-center justify-center">
                    <EnvelopeIcon size={24} color="#5A7A5A" />
                  </View>
                  <Text className="text-ink-700 font-medium text-base text-center">
                    Check your email
                  </Text>
                  <Text className="text-ink-300 text-sm text-center leading-relaxed">
                    We sent a sign-in link to{'\n'}
                    <Text className="text-ink-700 font-medium">{forgotEmail}</Text>
                  </Text>
                  <Text className="text-ink-300 text-xs text-center leading-relaxed">
                    Click the link in the email to sign in. The link expires shortly.
                  </Text>
                  <Pressable
                    onPress={handleSendResetLink}
                    disabled={resetLoading}
                    className="py-2"
                  >
                    {resetLoading
                      ? <ActivityIndicator color="#5A7A5A" size="small" />
                      : <Text className="text-sage-600 text-sm font-medium">Resend link</Text>
                    }
                  </Pressable>
                </View>
              )}

              {/* ── Email / Password ─────────────────────────────────────── */}
              {status !== 'confirm_email' && status !== 'forgot_password' && status !== 'link_sent' && (
              <View className="gap-y-3 mb-4">
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="bg-white border border-sand-200 rounded-xl px-4 py-3.5 text-ink-900 text-sm"
                  placeholderTextColor="#B8A99A"
                />
                <View className="flex-row items-center bg-white border border-sand-200 rounded-xl">
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 px-4 py-3.5 text-ink-900 text-sm"
                    placeholderTextColor="#B8A99A"
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    className="px-3 py-3.5"
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#B8A99A"
                    />
                  </Pressable>
                </View>
                {tab === 'signin' && (
                  <Pressable
                    onPress={() => {
                      setForgotEmail(email);
                      setErrorMsg('');
                      setStatus('forgot_password');
                    }}
                    className="self-end"
                  >
                    <Text className="text-sage-600 text-xs font-medium">Forgot password?</Text>
                  </Pressable>
                )}
              </View>
              )}

              {/* ── Error message ────────────────────────────────────────── */}
              {status !== 'confirm_email' && status !== 'forgot_password' && status !== 'link_sent' && status === 'error' && errorMsg ? (
                <Text className="text-red-400 text-xs mb-4 text-center">{errorMsg}</Text>
              ) : null}

              {/* ── Primary CTA ──────────────────────────────────────────── */}
              {status !== 'confirm_email' && status !== 'forgot_password' && status !== 'link_sent' && (
              <Pressable
                onPress={handleEmailAuth}
                disabled={status === 'loading'}
                className="bg-sage-600 py-4 rounded-2xl items-center mb-4 active:bg-sage-700"
              >
                {status === 'loading'
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text className="text-pure-white font-semibold text-base">
                      {tab === 'signin' ? 'Sign in' : 'Create account'}
                    </Text>
                }
              </Pressable>
              )}

              {/* ── Divider ──────────────────────────────────────────────── */}
              {status !== 'confirm_email' && status !== 'forgot_password' && status !== 'link_sent' && (
              <>
              <View className="flex-row items-center gap-x-3 mb-4">
                <View className="flex-1 h-px bg-sand-200" />
                <Text className="text-ink-300 text-xs">or</Text>
                <View className="flex-1 h-px bg-sand-200" />
              </View>

              {/* ── Native provider buttons ───────────────────────────────── */}
              <View className="gap-y-3">
                <Pressable
                  onPress={handleGoogle}
                  disabled={status === 'loading'}
                  className="bg-white border border-sand-200 py-3.5 rounded-2xl flex-row items-center justify-center gap-x-2 active:bg-sand-100"
                >
                  <GoogleLogo />
                  <Text className="text-ink-700 font-medium text-sm">Continue with Google</Text>
                </Pressable>
              </View>
              </>
              )}
            </View>

            {/* ── Skip / Guest ─────────────────────────────────────────────── */}
            <View className="items-center mt-8 gap-y-1">
              <Pressable onPress={finishAsGuest} className="py-3 px-6 active:opacity-60">
                <Text className="text-ink-300 text-sm">
                  {isFromSettings ? 'Cancel' : 'Skip for now — stay local only'}
                </Text>
              </Pressable>
              {!isFromSettings && (
                <Text className="text-ink-100 text-xs text-center px-4">
                  All your data is stored on your device first. An account is optional.
                </Text>
              )}
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
