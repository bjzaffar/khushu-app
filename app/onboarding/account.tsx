import {
  View, Text, Pressable, TextInput, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase/client';
import { db } from '@/db/database';
import { settings } from '@/db/schema';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function markOnboardingComplete() {
  await db.insert(settings)
    .values({ key: 'onboarding_complete', value: 'true' })
    .onConflictDoUpdate({ target: settings.key, set: { value: 'true' } });
}

type Tab = 'signin' | 'signup';
type Status = 'idle' | 'loading' | 'error' | 'confirm_email';

// ─── component ────────────────────────────────────────────────────────────────

export default function AccountScreen() {
  // "from=settings" means we came from Settings, not onboarding
  const { from } = useLocalSearchParams<{ from?: string }>();
  const isFromSettings = from === 'settings';

  const { setHasCompletedOnboarding, setUserId } = useAppStore();

  const [tab, setTab]         = useState<Tab>('signin');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus]   = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  // ─── navigation ─────────────────────────────────────────────────────────────

  async function finishAsGuest() {
    if (!isFromSettings) {
      await markOnboardingComplete();
      setHasCompletedOnboarding(true);
      router.replace('/(tabs)');
    } else {
      router.back();
    }
  }

  async function onAuthSuccess(userId: string) {
    setUserId(userId);
    // TODO Step 3c: check Supabase subscriptions table → setIsPremium
    if (!isFromSettings) {
      await markOnboardingComplete();
      setHasCompletedOnboarding(true);
      router.replace('/(tabs)');
    } else {
      router.back();
    }
  }

  // ─── email/password handlers ─────────────────────────────────────────────────

  async function handleCheckConfirmation() {
    setStatus('loading');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: confirmEmail,
        password,
      });
      if (error) {
        setErrorMsg('Email not confirmed yet. Check your inbox and try again.');
        setStatus('error');
        return;
      }
      const userId = data?.user?.id ?? data?.session?.user?.id;
      if (userId) await onAuthSuccess(userId);
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  async function handleEmailAuth() {
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter your email and password.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const { data, error } =
        tab === 'signin'
          ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
          : await supabase.auth.signUp({ email: email.trim(), password });

      if (error) {
        setErrorMsg(error.message);
        setStatus('error');
        return;
      }

      const userId = data?.user?.id ?? data?.session?.user?.id;
      if (userId) {
        await onAuthSuccess(userId);
      } else if (tab === 'signup') {
        setConfirmEmail(email.trim());
        setStatus('confirm_email');
      }
    } catch {
      setErrorMsg('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  // ─── OAuth handlers ──────────────────────────────────────────────────────────

  async function handleGoogle() {
    setStatus('loading');
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'khushu://auth/callback' },
      });
      if (error) { setErrorMsg(error.message); setStatus('error'); }
      // Navigation handled by deep-link listener in _layout.tsx (TODO Step 3c)
    } catch {
      setErrorMsg('Could not open Google sign-in. Please try again.');
      setStatus('error');
    }
  }

  async function handleApple() {
    setStatus('loading');
    setErrorMsg('');
    try {
      setErrorMsg('Apple sign-in coming soon.');
      setStatus('error');
    } catch {
      setErrorMsg('Could not complete Apple sign-in. Please try again.');
      setStatus('error');
    }
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
                  <Text className="text-sage-600 text-sm font-medium">← Back</Text>
                </Pressable>
              )}

              <View className="items-center gap-y-2 mb-8">
                <Text className="text-4xl">☁️</Text>
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
                  <View className="w-16 h-16 rounded-full bg-sage-600 items-center justify-center">
                    <Text className="text-white text-2xl">✉</Text>
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
                  {status === 'error' && errorMsg ? (
                    <Text className="text-red-400 text-xs text-center">{errorMsg}</Text>
                  ) : null}
                  <Pressable
                    onPress={handleCheckConfirmation}
                    disabled={status === 'loading'}
                    className="bg-sage-600 py-4 rounded-2xl items-center w-full active:bg-sage-700"
                  >
                    {status === 'loading'
                      ? <ActivityIndicator color="#FFFFFF" />
                      : <Text className="text-white font-semibold text-base">I've confirmed my email</Text>
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

              {/* ── Email / Password ─────────────────────────────────────── */}
              {status !== 'confirm_email' && (
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
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="bg-white border border-sand-200 rounded-xl px-4 py-3.5 text-ink-900 text-sm"
                  placeholderTextColor="#B8A99A"
                />
              </View>
              )}

              {/* ── Error message ────────────────────────────────────────── */}
              {status !== 'confirm_email' && status === 'error' && errorMsg ? (
                <Text className="text-red-400 text-xs mb-4 text-center">{errorMsg}</Text>
              ) : null}

              {/* ── Primary CTA ──────────────────────────────────────────── */}
              {status !== 'confirm_email' && (
              <Pressable
                onPress={handleEmailAuth}
                disabled={status === 'loading'}
                className="bg-sage-600 py-4 rounded-2xl items-center mb-4 active:bg-sage-700"
              >
                {status === 'loading'
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text className="text-white font-semibold text-base">
                      {tab === 'signin' ? 'Sign in' : 'Create account'}
                    </Text>
                }
              </Pressable>
              )}

              {/* ── Divider ──────────────────────────────────────────────── */}
              {status !== 'confirm_email' && (
              <>
              <View className="flex-row items-center gap-x-3 mb-4">
                <View className="flex-1 h-px bg-sand-200" />
                <Text className="text-ink-300 text-xs">or</Text>
                <View className="flex-1 h-px bg-sand-200" />
              </View>

              {/* ── OAuth buttons ────────────────────────────────────────── */}
              <View className="gap-y-3">
                <Pressable
                  onPress={handleGoogle}
                  disabled={status === 'loading'}
                  className="bg-white border border-sand-200 py-3.5 rounded-2xl flex-row items-center justify-center gap-x-2 active:bg-sand-100"
                >
                  <Text className="text-lg">G</Text>
                  <Text className="text-ink-700 font-medium text-sm">Continue with Google</Text>
                </Pressable>

                {Platform.OS === 'ios' && (
                  <Pressable
                    onPress={handleApple}
                    disabled={status === 'loading'}
                    className="bg-ink-900 py-3.5 rounded-2xl flex-row items-center justify-center gap-x-2 active:bg-ink-700"
                  >
                    <Text className="text-white text-lg"></Text>
                    <Text className="text-white font-medium text-sm">Sign in with Apple</Text>
                  </Pressable>
                )}
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
