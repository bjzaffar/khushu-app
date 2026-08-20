import {
  View, Pressable, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeftIcon, EnvelopeIcon, KeyIcon, LockClosedIcon } from 'react-native-heroicons/outline';
import { supabase } from '@/lib/supabase/client';
import { resetToAppRoot } from '@/lib/navigation';

type ScreenMode = 'send_link' | 'link_sent' | 'update_password';

function isNetworkError(error: unknown): boolean {
  const details = error instanceof Error
    ? `${error.name} ${error.message} ${String((error as Error & { context?: unknown; cause?: unknown }).context)} ${String((error as Error & { cause?: unknown }).cause)}`
    : String(error);
  return /network request failed|failed to fetch|network error|offline|internet|functionsfetcherror|failed to send a request to the edge function/i.test(details);
}

export default function ChangePasswordScreen() {
  const [mode, setMode] = useState<ScreenMode>('send_link');
  const [userEmail, setUserEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      // If user has a recovery session (token verified in callback), show password update form
      if (session) {
        setMode('update_password');
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) setUserEmail(data.user.email);
      } else {
        const { data } = await supabase.auth.getUser();
        if (data.user?.email) setUserEmail(data.user.email);
      }
    }
    init();
  }, []);

  async function handleSendResetLink() {
    setLoading(true);
    setErrorMsg('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: 'khushuai://auth/callback',
      });
      if (error) {
        setErrorMsg(isNetworkError(error) ? 'No internet connection' : error.message);
        setLoading(false);
        return;
      }
      setMode('link_sent');
    } catch (error) {
      setErrorMsg(isNetworkError(error) ? 'No internet connection' : 'Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  async function handleUpdatePassword() {
    setErrorMsg('');
    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setErrorMsg(isNetworkError(error) ? 'No internet connection' : error.message);
        setLoading(false);
        return;
      }
      resetToAppRoot();
    } catch (error) {
      setErrorMsg(isNetworkError(error) ? 'No internet connection' : 'Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 pt-6 pb-10">

            {/* ── Header ──────────────────────────────────────────────────── */}
            <Pressable onPress={() => router.back()} className="mb-4 self-start p-1 active:opacity-60">
              <View className="flex-row items-center gap-x-1"><ArrowLeftIcon size={16} color="#5A7A5A" /><Text className="text-sage-600 text-sm font-medium">Back</Text></View>
            </Pressable>

            {/* ── Step 1: Send reset link ────────────────────────────────── */}
            {mode === 'send_link' && (
              <View className="items-center gap-y-4 mt-8">
                <View className="w-16 h-16 rounded-full bg-sage-600 items-center justify-center">
                  <LockClosedIcon size={24} color="#FFFFFF" />
                </View>
                <Text className="text-ink-700 font-medium text-base text-center">
                  Change your password
                </Text>
                <Text className="text-ink-300 text-sm text-center leading-relaxed">
                  We{'\''}ll send a reset link to{'\n'}
                  <Text className="text-ink-700 font-medium">{userEmail}</Text>
                </Text>
                {errorMsg ? (
                  <Text className="text-red-400 text-xs text-center">{errorMsg}</Text>
                ) : null}
                <Pressable
                  onPress={handleSendResetLink}
                  disabled={loading}
                  className="bg-sage-600 py-4 rounded-2xl items-center w-full active:bg-sage-700"
                >
                  {loading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text className="text-pure-white font-semibold text-base">Send reset link</Text>
                  }
                </Pressable>
              </View>
            )}

            {/* ── Step 2: Link sent ──────────────────────────────────────── */}
            {mode === 'link_sent' && (
              <View className="items-center gap-y-4 mt-8">
                <View className="w-16 h-16 rounded-full bg-sage-600 items-center justify-center">
                  <EnvelopeIcon size={24} color="#FFFFFF" />
                </View>
                <Text className="text-ink-700 font-medium text-base text-center">
                  Check your email
                </Text>
                <Text className="text-ink-300 text-sm text-center leading-relaxed">
                  We sent a reset link to{'\n'}
                  <Text className="text-ink-700 font-medium">{userEmail}</Text>
                </Text>
                <Text className="text-ink-300 text-xs text-center leading-relaxed">
                  Click the link to set your new password. The link expires shortly.
                </Text>
                <Pressable
                  onPress={handleSendResetLink}
                  disabled={loading}
                  className="py-2"
                >
                  {loading
                    ? <ActivityIndicator color="#5A7A5A" size="small" />
                    : <Text className="text-sage-600 text-sm font-medium">Resend link</Text>
                  }
                </Pressable>
              </View>
            )}

            {/* ── Step 3: Update password ───────────────────────────────── */}
            {mode === 'update_password' && (
              <View className="items-center gap-y-4 mt-8">
                <View className="w-16 h-16 rounded-full bg-sage-600 items-center justify-center">
                  <KeyIcon size={24} color="#FFFFFF" />
                </View>
                <Text className="text-ink-700 font-medium text-base text-center">
                  Set new password
                </Text>
                <Text className="text-ink-300 text-sm text-center leading-relaxed">
                  Enter your new password below.
                </Text>
                <View className="flex-row items-center bg-sand-200 border border-sand-300 rounded-xl w-full">
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter new password"
                    secureTextEntry={!showNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 px-4 py-3 text-ink-700 text-sm"
                    placeholderTextColor="#8C817A"
                  />
                  <Pressable
                    onPress={() => setShowNewPassword((visible) => !visible)}
                    className="px-4 py-3"
                    accessibilityRole="button"
                    accessibilityLabel={showNewPassword ? 'Hide new password' : 'Show new password'}
                  >
                    <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B6360" />
                  </Pressable>
                </View>
                <View className="flex-row items-center bg-sand-200 border border-sand-300 rounded-xl w-full">
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm new password"
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="flex-1 px-4 py-3 text-ink-700 text-sm"
                    placeholderTextColor="#8C817A"
                  />
                  <Pressable
                    onPress={() => setShowConfirmPassword((visible) => !visible)}
                    className="px-4 py-3"
                    accessibilityRole="button"
                    accessibilityLabel={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                  >
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B6360" />
                  </Pressable>
                </View>
                {errorMsg ? (
                  <Text className="text-red-400 text-xs self-start">{errorMsg}</Text>
                ) : null}
                <Pressable
                  onPress={handleUpdatePassword}
                  disabled={loading}
                  className="bg-sage-600 py-4 rounded-2xl items-center w-full active:bg-sage-700"
                >
                  {loading
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text className="text-pure-white font-semibold text-base">Update password</Text>
                  }
                </Pressable>
              </View>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
