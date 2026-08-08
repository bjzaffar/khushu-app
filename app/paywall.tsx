import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Typography';
import {
  DevicePhoneMobileIcon,
  LightBulbIcon,
  PlusCircleIcon,
  PresentationChartLineIcon,
} from 'react-native-heroicons/outline';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import {
  getCurrentRevenueCatOffering,
  isRevenueCatPurchaseCancellation,
  openRevenueCatCustomerCenter,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  type RevenueCatOffering,
  type RevenueCatPackage,
} from '@/lib/revenuecat/service';

const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim();
const termsOfUseUrl = process.env.EXPO_PUBLIC_TERMS_OF_USE_URL?.trim();

function packageLabel(aPackage: RevenueCatPackage): string {
  const identity = `${aPackage.identifier} ${aPackage.packageType}`.toLowerCase();
  if (identity.includes('month')) return 'Monthly';
  return aPackage.product.title || 'Premium';
}

function isMonthlyPackage(aPackage: RevenueCatPackage): boolean {
  return `${aPackage.identifier} ${aPackage.packageType}`.toLowerCase().includes('month');
}

function selectDefaultPackage(offering: RevenueCatOffering): RevenueCatPackage | null {
  return offering.monthly
    ?? offering.availablePackages.find(isMonthlyPackage)
    ?? null;
}

export default function PaywallScreen() {
  const { userId, premiumStatus } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);
  const [offering, setOffering] = useState<RevenueCatOffering | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<RevenueCatPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      router.replace({
        pathname: '/onboarding/account',
        params: { from: 'settings', returnTo: 'paywall' },
      });
      return;
    }
    if (premiumStatus === 'unknown' || isPremium) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setMessage(null);
    getCurrentRevenueCatOffering()
      .then((currentOffering) => {
        if (!active) return;
        const monthlyPackage = currentOffering ? selectDefaultPackage(currentOffering) : null;
        if (!currentOffering || !monthlyPackage) {
          setMessage('The monthly subscription is not available yet. Please try again later.');
          return;
        }
        setOffering(currentOffering);
        setSelectedPackage(monthlyPackage);
      })
      .catch((error) => {
        console.warn('[revenuecat] offering load failed:', error);
        if (active) setMessage('Could not load subscriptions. Check your connection and try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [userId, premiumStatus, isPremium]);

  const packages = useMemo(
    () => offering?.availablePackages.filter(isMonthlyPackage) ?? [],
    [offering]
  );
  const hasLegalLinks = Boolean(privacyPolicyUrl && termsOfUseUrl);

  async function handlePurchase() {
    if (!selectedPackage || purchasing) return;
    setPurchasing(true);
    setMessage(null);
    try {
      await purchaseRevenueCatPackage(selectedPackage);
      setMessage('Premium is now active.');
    } catch (error) {
      if (!isRevenueCatPurchaseCancellation(error)) {
        console.warn('[revenuecat] purchase failed:', error);
        setMessage('The purchase could not be completed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  }

  async function handleRestore() {
    if (purchasing) return;
    setPurchasing(true);
    setMessage(null);
    try {
      const restored = await restoreRevenueCatPurchases();
      Alert.alert(
        restored ? 'Premium restored' : 'No active subscription found',
        restored
          ? 'Your Premium access has been restored.'
          : 'There is no active Premium subscription for this store account.'
      );
    } catch (error) {
      console.warn('[revenuecat] restore failed:', error);
      setMessage('Could not restore purchases. Please try again.');
    } finally {
      setPurchasing(false);
    }
  }

  async function openLegalUrl(url: string | undefined) {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      setMessage('Could not open that link. Please try again later.');
    }
  }

  function closePaywall() {
    // A widget opens this screen through a deep link, which may leave the
    // paywall as the only route in the navigation stack. In that case there
    // is nothing for `back()` to dismiss to, so explicitly return home.
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView className="flex-1 px-6 pt-6" contentContainerStyle={{ paddingBottom: 40 }}>
        <Pressable onPress={closePaywall} className="self-end mb-4 p-2 active:opacity-60">
          <Text className="text-ink-300 text-sm">Close</Text>
        </Pressable>

        <View className="items-center gap-y-3 mb-10">
          <Text className="text-4xl">✨</Text>
          <Text className="text-2xl font-semibold text-ink-900 text-center">Unlock Premium</Text>
          <Text className="text-ink-300 text-sm text-center leading-relaxed">
            Deepen your focus with AI-powered reminders and detailed insights.
          </Text>
        </View>

        <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden mb-8">
          {[
            { Icon: PlusCircleIcon, title: 'Custom distractions', description: "Add more distractions which the default distractions don't cover." },
            { Icon: LightBulbIcon, title: 'AI-generated reminders', description: 'Personalised reminders for custom distractions—based only on verified messages.' },
            { Icon: PresentationChartLineIcon, title: 'Detailed insights', description: 'Explore larger chart date ranges and see top distraction by salah.' },
            { Icon: DevicePhoneMobileIcon, title: 'Heatmap widget', description: 'See your weekly focus on your homescreen.' },
          ].map(({ Icon, title, description }, index, items) => (
            <View
              key={title}
              className={`px-5 py-4 flex-row gap-x-4 items-start${index < items.length - 1 ? ' border-b border-sand-100' : ''}`}
            >
              <Icon size={20} color="#5a7a5a" style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-ink-700 font-medium text-sm">{title}</Text>
                <Text className="text-ink-300 text-xs leading-relaxed mt-1">{description}</Text>
              </View>
            </View>
          ))}
        </View>

        {!userId ? (
          <View className="bg-white rounded-2xl border border-sand-200 p-5 items-center">
            <Text className="text-ink-700 font-medium text-base text-center">Sign in to subscribe</Text>
            <Text className="text-ink-300 text-sm text-center mt-1">
              Your subscription is linked to your Khushu account, not an anonymous device.
            </Text>
          </View>
        ) : isPremium ? (
          <View className="bg-white rounded-2xl border border-sand-200 p-5 items-center gap-y-3">
            <Text className="text-ink-700 font-medium text-base">Premium is active</Text>
            <Pressable
              onPress={() => openRevenueCatCustomerCenter().catch((error) => {
                console.warn('[revenuecat] customer center failed:', error);
                setMessage('Could not open subscription management. Please try again.');
              })}
              className="bg-sage-600 py-4 rounded-2xl items-center self-stretch active:bg-sage-700"
            >
              <Text className="text-white font-semibold text-base">Manage subscription</Text>
            </Pressable>
          </View>
        ) : loading || premiumStatus === 'unknown' ? (
          <View className="py-8 items-center gap-y-3">
            <ActivityIndicator color="#5A7A5A" />
            <Text className="text-ink-300 text-sm">Loading subscriptions…</Text>
          </View>
        ) : (
          <>
            {packages.map((aPackage) => {
              const selected = selectedPackage?.identifier === aPackage.identifier;
              return (
                <Pressable
                  key={aPackage.identifier}
                  onPress={() => setSelectedPackage(aPackage)}
                  className={`mb-3 rounded-2xl border px-5 py-4 flex-row items-center justify-between ${
                    selected ? 'border-sage-600 bg-sage-50' : 'border-sand-200 bg-white'
                  }`}
                >
                  <View>
                    <Text className="text-ink-700 font-medium text-base">{packageLabel(aPackage)}</Text>
                    <Text className="text-ink-300 text-xs mt-1">Auto-renewing subscription</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-ink-900 font-semibold text-base">{aPackage.product.priceString}</Text>
                    {selected && <Text className="text-sage-600 text-xs mt-1">Selected</Text>}
                  </View>
                </Pressable>
              );
            })}

            <Pressable
              disabled={!selectedPackage || purchasing || !hasLegalLinks}
              onPress={handlePurchase}
              className={`py-4 rounded-2xl items-center mb-3 ${
                selectedPackage && !purchasing && hasLegalLinks ? 'bg-sage-600 active:bg-sage-700' : 'bg-sand-200'
              }`}
            >
              {purchasing ? <ActivityIndicator color="#FFFFFF" /> : (
                <Text className={`font-semibold text-base ${hasLegalLinks ? 'text-white' : 'text-ink-300'}`}>
                  {selectedPackage ? `Subscribe — ${selectedPackage.product.priceString}` : 'Choose a subscription'}
                </Text>
              )}
            </Pressable>

            <Pressable disabled={purchasing} className="items-center py-3 active:opacity-60" onPress={handleRestore}>
              <Text className="text-ink-300 text-sm">Restore purchases</Text>
            </Pressable>
          </>
        )}

        {message && <Text className="text-ink-300 text-sm text-center mt-4">{message}</Text>}

        <View className="mt-6 items-center gap-y-2">
          {hasLegalLinks ? (
            <Text className="text-ink-300 text-xs text-center leading-relaxed">
              Payment will be charged to your {Platform.OS === 'ios' ? 'Apple ID' : 'Google Play account'}. Your subscription renews automatically unless cancelled before the renewal date.{' '}
              <Text className="text-sage-600" onPress={() => openLegalUrl(termsOfUseUrl)}>Terms of Use</Text>
              {' · '}
              <Text className="text-sage-600" onPress={() => openLegalUrl(privacyPolicyUrl)}>Privacy Policy</Text>
            </Text>
          ) : (
            <Text className="text-ink-300 text-xs text-center leading-relaxed">
              Subscription legal links must be configured before this paywall can accept purchases.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
