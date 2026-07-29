import { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, Pressable } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase/client';
import { consumePendingUrl } from '@/lib/deeplink';

function parseParams(str: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of str.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(rest.join('='));
  }
  return params;
}

async function processUrl(rawUrl: string): Promise<{ action: 'recovery' | 'other' } | { error: string }> {
  const hashIndex = rawUrl.indexOf('#');
  const queryIndex = rawUrl.indexOf('?');

  let allParams: Record<string, string> = {};

  if (queryIndex !== -1) {
    const end = hashIndex !== -1 ? hashIndex : rawUrl.length;
    Object.assign(allParams, parseParams(rawUrl.slice(queryIndex + 1, end)));
  }
  if (hashIndex !== -1) {
    Object.assign(allParams, parseParams(rawUrl.slice(hashIndex + 1)));
  }

  console.log('[AuthCallback] parsed callback:', {
    hasAccessToken: Boolean(allParams.access_token),
    hasCode: Boolean(allParams.code),
    hasTokenHash: Boolean(allParams.token_hash),
    type: allParams.type,
  });

  if (allParams.access_token && allParams.refresh_token) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: allParams.access_token,
      refresh_token: allParams.refresh_token,
    });
    if (sessionError) return { error: sessionError.message };
    return allParams.type === 'recovery' ? { action: 'recovery' } : { action: 'other' };
  }

  if (allParams.token_hash && allParams.type) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: allParams.token_hash,
      type: allParams.type as 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email',
    });
    if (verifyError) return { error: verifyError.message };
    return allParams.type === 'recovery' ? { action: 'recovery' } : { action: 'other' };
  }

  if (allParams.code) {
    const { error: codeError } = await supabase.auth.exchangeCodeForSession(allParams.code);
    if (codeError) return { error: codeError.message };
    return allParams.type === 'recovery' ? { action: 'recovery' } : { action: 'other' };
  }

  return { error: 'Invalid or missing authentication parameters.' };
}

export default function AuthCallbackScreen() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Starting...');
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;

    async function go() {
      // 0) Use the URL captured early in _layout.tsx (before setup blocked the navigator)
      setStatus('Checking pending URL...');
      let rawUrl = consumePendingUrl();
      console.log('[AuthCallback] checking early captured URL:', Boolean(rawUrl));

      // 1) Try initial URL (cold start)
      if (!rawUrl) {
        setStatus('No pending URL. Trying getInitialURL...');
        rawUrl = await Linking.getInitialURL();
        console.log('[AuthCallback] received initial URL:', Boolean(rawUrl));
      }

      // 2) If Expo Router already consumed it, listen for incoming URLs
      if (!rawUrl) {
        setStatus('No initial URL. Waiting for Linking event...');
        const sub = Linking.addEventListener('url', (event) => {
          if (!processed.current) {
            handleUrl(event.url);
          }
        });
        await new Promise((r) => setTimeout(r, 5000));
        if (!rawUrl && processed.current) {
          sub.remove();
          return;
        }
        sub.remove();
      }

      if (!rawUrl) {
        setError('No authentication URL received.');
        return;
      }

      handleUrl(rawUrl);
    }

    async function handleUrl(rawUrl: string) {
      if (processed.current) return;
      processed.current = true;
      console.log('[AuthCallback] handling authentication URL');

      try {
        setStatus('Processing URL...');
        const result = await processUrl(rawUrl);
        console.log('[AuthCallback] authentication result:', 'error' in result ? 'error' : result.action);

        if ('error' in result) {
          setError(result.error);
          return;
        }

        setStatus(`Navigating to ${result.action}...`);
        if (result.action === 'recovery') {
          router.replace('/settings/change-password');
        } else {
          router.replace('/(tabs)');
        }
        setStatus('Navigation sent.');
      } catch (e: unknown) {
        console.error('[AuthCallback] unexpected error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      }
    }

    go();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#FAF7F2' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#1A1917', marginBottom: 8 }}>
          Authentication failed
        </Text>
        <Text style={{ fontSize: 14, color: '#6B6360', textAlign: 'center', marginBottom: 12 }}>
          This password-reset link is invalid or has expired. Request a new link and try again.
        </Text>
        <Pressable
          onPress={() => router.replace('/onboarding/account')}
          style={{ paddingVertical: 12, paddingHorizontal: 20 }}
        >
          <Text style={{ color: '#5A7A5A', fontSize: 14, fontWeight: '600' }}>
            Return to sign in
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAF7F2', padding: 20 }}>
      <ActivityIndicator size="large" color="#5A7A5A" />
      <Text style={{ marginTop: 12, color: '#6B6360', fontSize: 14 }}>Signing you in…</Text>
      <Text style={{ marginTop: 8, color: '#999', fontSize: 11 }}>{status}</Text>
    </View>
  );
}
