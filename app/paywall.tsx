import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { router } from 'expo-router';
import {
  CheckCircleIcon,
  DevicePhoneMobileIcon,
  LightBulbIcon,
  PresentationChartLineIcon,
  SparklesIcon,
} from 'react-native-heroicons/outline';
import { Coffee } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Typography';
import { AppDialog, type AppDialogTone } from '@/components/ui/AppDialog';
import { selectIsPremium, useAppStore } from '@/store/appStore';
import {
  getCurrentRevenueCatOffering,
  isRevenueCatPurchaseCancellation,
  openRevenueCatCustomerCenter,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  revenueCatPurchaseErrorMessage,
  type RevenueCatOffering,
  type RevenueCatPackage,
} from '@/lib/revenuecat/service';
import {
  annualSavingsPercent,
  billingPeriodForPackage,
  packagePriceSuffix,
  packageRenewalCopy,
  packageTitle,
  selectPaywallPackages,
} from '@/lib/revenuecat/paywall';
import { captureAnalyticsEvent } from '@/lib/analytics/posthog';

const privacyPolicyUrl = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim();
const termsOfUseUrl = process.env.EXPO_PUBLIC_TERMS_OF_USE_URL?.trim();

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
type WorkingAction = 'purchase' | 'restore' | 'manage' | null;
type Notice = { tone: 'info' | 'error'; text: string };
type PaywallDialog = {
  title: string;
  message: string;
  tone: AppDialogTone;
  closePaywall: boolean;
  showIcon?: boolean;
};

const premiumFeatures = [
  {
    Icon: LightBulbIcon,
    title: 'AI-generated reminders',
    description: 'Get relevant reminders for your custom distractions.',
  },
  {
    Icon: PresentationChartLineIcon,
    title: 'Detailed insights',
    description: 'Explore longer chart ranges and see your top distraction by salah.',
  },
  {
    Icon: DevicePhoneMobileIcon,
    title: 'Heatmap widget',
    description: 'See your weekly focus at a glance from your home screen.',
  },
] as const;

export default function PaywallScreen() {
  const { userId, premiumStatus } = useAppStore();
  const isPremium = useAppStore(selectIsPremium);
  const [offering, setOffering] = useState<RevenueCatOffering | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<RevenueCatPackage | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [workingAction, setWorkingAction] = useState<WorkingAction>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<PaywallDialog | null>(null);

  const hasLegalLinks = Boolean(privacyPolicyUrl && termsOfUseUrl);
  const packages = useMemo(
    () => offering ? selectPaywallPackages(offering) : [],
    [offering]
  );
  const monthlyPackage = packages.find(
    (aPackage) => billingPeriodForPackage(aPackage) === 'monthly'
  );

  useEffect(() => {
    captureAnalyticsEvent('paywall viewed');
  }, []);

  const loadOffering = useCallback(async () => {
    setLoadState('loading');
    setNotice(null);
    try {
      const currentOffering = await getCurrentRevenueCatOffering();
      const availablePackages = currentOffering
        ? selectPaywallPackages(currentOffering)
        : [];

      if (!currentOffering || availablePackages.length === 0) {
        setOffering(null);
        setSelectedPackage(null);
        setLoadState('error');
        setNotice({
          tone: 'error',
          text: 'Subscriptions are not available in this build or store region yet.',
        });
        return;
      }

      setOffering(currentOffering);
      setSelectedPackage((current) => (
        availablePackages.find((item) => item.identifier === current?.identifier)
        ?? availablePackages.find((item) => billingPeriodForPackage(item) === 'monthly')
        ?? availablePackages[0]
      ));
      setLoadState('ready');
    } catch (error) {
      console.warn('[revenuecat] offering load failed:', error);
      setOffering(null);
      setSelectedPackage(null);
      setLoadState('error');
      setNotice({
        tone: 'error',
        text: 'Could not load subscriptions. Check your connection and try again.',
      });
    }
  }, []);

  useEffect(() => {
    if (isPremium) {
      setLoadState('idle');
      return;
    }
    if (userId && premiumStatus === 'unknown') {
      setLoadState('loading');
      return;
    }
    loadOffering();
  }, [isPremium, loadOffering, premiumStatus, userId]);

  function leavePaywall() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }

  function closePaywall() {
    captureAnalyticsEvent('paywall dismissed');
    leavePaywall();
  }

  function openAccount() {
    router.push({
      pathname: '/onboarding/account',
      params: { from: 'settings', returnTo: 'paywall' },
    });
  }

  async function handlePurchase() {
    if (!selectedPackage || workingAction) return;
    if (!userId) {
      openAccount();
      return;
    }
    if (!hasLegalLinks) {
      setNotice({ tone: 'error', text: 'Subscription legal links are not configured for this build.' });
      return;
    }

    setWorkingAction('purchase');
    setNotice(null);
    captureAnalyticsEvent('purchase started', {
      billing_period: billingPeriodForPackage(selectedPackage),
    });
    try {
      const entitlementActive = await purchaseRevenueCatPackage(selectedPackage);
      if (!entitlementActive) {
        setNotice({
          tone: 'error',
          text: 'The store completed the purchase, but Premium is still syncing. Try Restore purchases in a moment.',
        });
        return;
      }

      captureAnalyticsEvent('purchase completed', {
        billing_period: billingPeriodForPackage(selectedPackage),
      });

      setDialog({
        title: 'Welcome to Premium',
        message: 'Your Premium features are now active on this Khushu account.',
        tone: 'success',
        closePaywall: true,
      });
    } catch (error) {
      if (!isRevenueCatPurchaseCancellation(error)) {
        console.warn('[revenuecat] purchase failed:', error);
        setNotice({ tone: 'error', text: revenueCatPurchaseErrorMessage(error) });
      }
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleRestore() {
    if (workingAction) return;
    if (!userId) {
      openAccount();
      return;
    }

    setWorkingAction('restore');
    setNotice(null);
    try {
      const restored = await restoreRevenueCatPurchases();
      setDialog({
        title: restored ? 'Premium restored' : 'No active subscription found',
        message: restored
          ? 'Premium is active on this Khushu account.'
          : 'This store account has no active Khushu subscription.',
        tone: restored ? 'success' : 'info',
        closePaywall: restored,
        showIcon: false,
      });
    } catch (error) {
      console.warn('[revenuecat] restore failed:', error);
      setNotice({
        tone: 'error',
        text: 'Could not restore purchases. Check your connection and try again.',
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function handleManageSubscription() {
    if (workingAction) return;
    setWorkingAction('manage');
    setNotice(null);
    try {
      const opened = await openRevenueCatCustomerCenter();
      if (!opened) {
        setNotice({ tone: 'error', text: 'Subscription management is not configured for this build.' });
      }
    } catch (error) {
      console.warn('[revenuecat] customer center failed:', error);
      setNotice({
        tone: 'error',
        text: 'Could not open subscription management. Please try again.',
      });
    } finally {
      setWorkingAction(null);
    }
  }

  async function openLegalUrl(url: string | undefined) {
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      setNotice({ tone: 'error', text: 'Could not open that link. Please try again later.' });
    }
  }

  const selectedRenewalCopy = selectedPackage
    ? packageRenewalCopy(selectedPackage)
    : null;

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Premium screen"
          onPress={closePaywall}
          className="self-end px-2 py-2 mb-2 active:opacity-60"
        >
          <Text className="text-ink-300 text-sm">Close</Text>
        </Pressable>

        <View className="items-center gap-y-3 mb-8">
          <SparklesIcon size={26} color="#5A7A5A" />
          <Text className="text-2xl font-semibold text-ink-900 text-center">Grow your Khushu with Premium</Text>
          <View className="flex-row items-center gap-x-1.5 rounded-full bg-white px-4 py-2">
            <Text className="text-ink-500 text-sm">Less than a cup of coffee</Text>
            <Coffee size={16} color="#6B6360" />
          </View>
        </View>

        <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden mb-6">
          {premiumFeatures.map(({ Icon, title, description }, index) => (
            <View
              key={title}
              className={`px-5 py-4 flex-row gap-x-4 items-start${index < premiumFeatures.length - 1 ? ' border-b border-sand-100' : ''}`}
            >
              <Icon size={20} color="#5A7A5A" style={{ marginTop: 2 }} />
              <View className="flex-1">
                <Text className="text-ink-700 font-medium text-sm">{title}</Text>
                <Text className="text-ink-300 text-xs leading-relaxed mt-1">{description}</Text>
              </View>
            </View>
          ))}
        </View>

        {isPremium ? (
          <View className="bg-white rounded-2xl border border-sand-200 p-5 items-center gap-y-3">
            <CheckCircleIcon size={30} color="#5A7A5A" />
            <Text className="text-ink-900 font-semibold text-lg">Premium is active</Text>
            <Text className="text-ink-300 text-sm text-center leading-relaxed">
              Your Premium access is linked to this Khushu account.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={workingAction !== null}
              onPress={handleManageSubscription}
              className="bg-sage-600 py-4 rounded-2xl items-center self-stretch active:bg-sage-700"
            >
              {workingAction === 'manage'
                ? <ActivityIndicator color="#FFFFFF" />
                : <Text className="text-pure-white font-semibold text-base">Manage subscription</Text>}
            </Pressable>
          </View>
        ) : loadState === 'loading' || (userId && premiumStatus === 'unknown') ? (
          <View className="py-10 items-center gap-y-3">
            <ActivityIndicator color="#5A7A5A" />
            <Text className="text-ink-300 text-sm">Loading subscriptions...</Text>
          </View>
        ) : loadState === 'error' ? (
          <View className="bg-white rounded-2xl border border-sand-200 p-5 items-center gap-y-3">
            <Text className="text-ink-700 font-medium text-base text-center">Subscriptions unavailable</Text>
            <Pressable
              accessibilityRole="button"
              onPress={loadOffering}
              className="bg-sage-600 py-3.5 rounded-2xl items-center self-stretch active:bg-sage-700"
            >
              <Text className="text-pure-white font-semibold text-sm">Try again</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={workingAction !== null}
              onPress={handleRestore}
              className="py-2 px-4 active:opacity-60"
            >
              <Text className="text-sage-600 text-sm font-medium">
                {userId ? 'Restore purchases' : 'Sign in to restore'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View accessibilityRole="radiogroup">
              {packages.map((aPackage) => {
                const selected = selectedPackage?.identifier === aPackage.identifier;
                const period = billingPeriodForPackage(aPackage);
                const savings = period === 'annual'
                  ? annualSavingsPercent(aPackage, monthlyPackage)
                  : null;

                return (
                  <Pressable
                    key={aPackage.identifier}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${packageTitle(aPackage)}, ${aPackage.product.priceString} ${packagePriceSuffix(aPackage)}`}
                    onPress={() => {
                      setSelectedPackage(aPackage);
                      setNotice(null);
                    }}
                    className={`mb-3 rounded-2xl border px-5 py-4 flex-row items-center gap-x-3 ${
                      selected ? 'border-sage-600 bg-white' : 'border-sand-200 bg-white'
                    }`}
                  >
                    <View className={`w-5 h-5 rounded-full border items-center justify-center ${
                      selected ? 'border-sage-600' : 'border-sand-300'
                    }`}>
                      {selected && <View className="w-2.5 h-2.5 rounded-full bg-sage-600" />}
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-x-2">
                        <Text className="text-ink-700 font-semibold text-base">{packageTitle(aPackage)}</Text>
                        {savings !== null && (
                          <View className="bg-sage-600 rounded-full px-2 py-0.5">
                            <Text className="text-pure-white text-xs font-semibold">Save {savings}%</Text>
                          </View>
                        )}
                      </View>
                      {period === 'annual' && aPackage.product.pricePerMonthString && (
                        <Text className="text-ink-300 text-xs mt-1">
                          About {aPackage.product.pricePerMonthString} per month
                        </Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-ink-900 font-semibold text-base">{aPackage.product.priceString}</Text>
                      <Text className="text-ink-300 text-xs mt-0.5">{packagePriceSuffix(aPackage).replace('/ ', 'per ')}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!selectedPackage || workingAction !== null || (Boolean(userId) && !hasLegalLinks)}
              onPress={handlePurchase}
              className={`py-4 rounded-2xl items-center mb-2 ${
                selectedPackage && !workingAction && (!userId || hasLegalLinks)
                  ? 'bg-sage-600 active:bg-sage-700'
                  : 'bg-sand-200'
              }`}
            >
              {workingAction === 'purchase' ? <ActivityIndicator color="#FFFFFF" /> : (
                <Text className={`font-semibold text-base ${
                  selectedPackage && (!userId || hasLegalLinks) ? 'text-pure-white' : 'text-ink-300'
                }`}>
                  {!userId
                    ? 'Sign in to subscribe'
                    : selectedPackage
                      ? `Subscribe - ${selectedPackage.product.priceString} ${packagePriceSuffix(selectedPackage)}`
                      : 'Choose a subscription'}
                </Text>
              )}
            </Pressable>

            {selectedRenewalCopy && (
              <Text className="text-ink-500 text-xs text-center leading-relaxed px-2 mb-2">
                {selectedRenewalCopy}
              </Text>
            )}

            {!userId && (
              <Text className="text-ink-300 text-xs text-center leading-relaxed px-3 mb-1">
                A Khushu account is required so Premium can follow you across devices. You will not be charged when signing in.
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={workingAction !== null}
              onPress={handleRestore}
              className="items-center py-3 active:opacity-60"
            >
              {workingAction === 'restore'
                ? <ActivityIndicator color="#5A7A5A" size="small" />
                : <Text className="text-sage-600 text-sm font-medium">
                    {userId ? 'Restore purchases' : 'Sign in to restore'}
                  </Text>}
            </Pressable>
          </>
        )}

        {notice && (
          <View className={`mt-4 rounded-xl px-4 py-3 ${notice.tone === 'error' ? 'bg-red-50' : 'bg-sage-50'}`}>
            <Text className={`text-sm text-center leading-relaxed ${
              notice.tone === 'error' ? 'text-red-400' : 'text-ink-500'
            }`}>
              {notice.text}
            </Text>
          </View>
        )}

        <View className="mt-6 items-center gap-y-2">
          {hasLegalLinks ? (
            <Text className="text-ink-300 text-xs text-center leading-relaxed">
              Payment will be charged to your {Platform.OS === 'ios' ? 'Apple Account' : 'Google Play account'}. Cancel or manage your subscription at any time from Account settings.{' '}
              <Text className="text-sage-600" onPress={() => openLegalUrl(termsOfUseUrl)}>Terms of Use</Text>
              {' | '}
              <Text className="text-sage-600" onPress={() => openLegalUrl(privacyPolicyUrl)}>Privacy Policy</Text>
            </Text>
          ) : (
            <Text className="text-red-400 text-xs text-center leading-relaxed">
              Subscription legal links must be configured before purchases can be accepted.
            </Text>
          )}
        </View>
      </ScrollView>

      <AppDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        tone={dialog?.tone}
        showIcon={dialog?.showIcon}
        onDismiss={() => setDialog(null)}
        actions={[{
          label: dialog?.closePaywall ? 'Continue' : 'OK',
          onPress: () => {
            const shouldClosePaywall = dialog?.closePaywall ?? false;
            setDialog(null);
            if (shouldClosePaywall) leavePaywall();
          },
        }]}
      />
    </SafeAreaView>
  );
}
