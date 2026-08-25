import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  CreditCardIcon,
} from 'react-native-heroicons/outline';
import type { CustomerInfo, PurchasesEntitlementInfo, Store } from 'react-native-purchases';
import { Text } from '@/components/ui/Typography';
import { ResponsiveContent } from '@/components/responsive/ResponsiveContent';
import { useResponsiveLayout } from '@/components/responsive/ResponsiveLayout';
import { AppDialog, type AppDialogTone } from '@/components/ui/AppDialog';
import {
  getRevenueCatCustomerInfo,
  restoreRevenueCatPurchases,
} from '@/lib/revenuecat/service';
import { PREMIUM_ENTITLEMENT_ID } from '@/lib/revenuecat/entitlements';

type LoadState = 'loading' | 'ready' | 'error';
type SubscriptionDialog = {
  title: string;
  message: string;
  tone: AppDialogTone;
};

function formatSubscriptionDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function storeName(store: Store | undefined): string {
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'Apple App Store';
  if (store === 'PLAY_STORE') return 'Google Play';
  if (store === 'AMAZON') return 'Amazon Appstore';
  if (store === 'STRIPE' || store === 'RC_BILLING' || store === 'PADDLE') return 'Khushu';
  if (store === 'TEST_STORE') return 'Test Store';
  return 'Your app store';
}

function managementButtonLabel(store: Store | undefined): string {
  if (store === 'APP_STORE' || store === 'MAC_APP_STORE') return 'Manage in the App Store';
  if (store === 'PLAY_STORE') return 'Manage in Google Play';
  return 'Open subscription settings';
}

function activeEntitlement(customerInfo: CustomerInfo | null): PurchasesEntitlementInfo | null {
  if (!customerInfo) return null;
  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]
    ?? customerInfo.entitlements.all[PREMIUM_ENTITLEMENT_ID]
    ?? null;
}

export default function ManageSubscriptionScreen() {
  const responsive = useResponsiveLayout();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [restoring, setRestoring] = useState(false);
  const [openingStore, setOpeningStore] = useState(false);
  const [dialog, setDialog] = useState<SubscriptionDialog | null>(null);

  const loadSubscription = useCallback(async (showLoading = true) => {
    if (showLoading) setLoadState('loading');
    try {
      const info = await getRevenueCatCustomerInfo();
      setCustomerInfo(info);
      setLoadState('ready');
    } catch (error) {
      console.warn('[revenuecat] subscription details failed:', error);
      setLoadState('error');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    loadSubscription();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadSubscription(false);
    });
    return () => appStateSubscription.remove();
  }, [loadSubscription]));

  const entitlement = activeEntitlement(customerInfo);
  const subscription = entitlement
    ? customerInfo?.subscriptionsByProductIdentifier[entitlement.productIdentifier]
    : null;
  const isActive = entitlement?.isActive ?? false;
  const hasBillingIssue = Boolean(entitlement?.billingIssueDetectedAt);
  const expiresOn = formatSubscriptionDate(entitlement?.expirationDate ?? null);
  const provider = storeName(entitlement?.store);
  const managementUrl = subscription?.managementURL ?? customerInfo?.managementURL ?? null;
  const planName = subscription?.displayName?.trim() || 'Khushu Premium';
  const isTrial = entitlement?.periodType === 'TRIAL';
  const isFamilyShared = entitlement?.ownershipType === 'FAMILY_SHARED';

  const statusLabel = hasBillingIssue
    ? 'Payment issue'
    : isActive && entitlement?.willRenew
      ? 'Active'
      : isActive
        ? 'Ending'
        : 'Inactive';

  const dateLabel = isActive && entitlement?.willRenew
    ? (isTrial ? 'Trial ends' : 'Next renewal')
    : 'Access until';

  async function openSubscriptionManagement() {
    if (!managementUrl || openingStore) return;
    setOpeningStore(true);
    try {
      await Linking.openURL(managementUrl);
    } catch (error) {
      console.warn('[revenuecat] subscription management URL failed:', error);
      setDialog({
        title: 'Could not open subscription settings',
        message: `Open ${provider} on this device and manage Khushu from your subscriptions.`,
        tone: 'warning',
      });
    } finally {
      setOpeningStore(false);
    }
  }

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    try {
      const restored = await restoreRevenueCatPurchases();
      await loadSubscription(false);
      setDialog({
        title: restored ? 'Premium restored' : 'No active subscription found',
        message: restored
          ? 'Your Khushu Premium subscription is active again.'
          : 'This store account does not have an active Khushu subscription.',
        tone: restored ? 'success' : 'info',
      });
    } catch (error) {
      console.warn('[revenuecat] restore failed:', error);
      setDialog({
        title: 'Could not restore purchases',
        message: 'Check your connection and make sure you are using the store account that purchased Khushu Premium.',
        tone: 'warning',
      });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-sand-100">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: responsive.scaleSpacing(16),
          paddingBottom: responsive.scaleSpacing(40),
        }}
      >
        <ResponsiveContent kind="form">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          onPress={() => router.back()}
          className="self-start flex-row items-center gap-x-1 p-1 mb-7 active:opacity-60"
          hitSlop={8}
          style={{ minHeight: responsive.isTablet ? responsive.scaleControl(44) : undefined }}
        >
          <ArrowLeftIcon size={responsive.scaleControl(16)} color="#5A7A5A" />
          <Text className="text-sage-600 text-sm font-medium">Back</Text>
        </Pressable>

        <View className="items-center mb-8">
          <View className="w-16 h-16 rounded-full bg-sage-600 items-center justify-center mb-4">
            <CreditCardIcon size={responsive.scaleControl(28)} color="#FFFFFF" />
          </View>
          <Text className="text-2xl font-semibold text-ink-900 text-center">
            Manage subscription
          </Text>
          <Text className="text-ink-300 text-sm text-center leading-relaxed mt-2 px-4">
            View your Premium plan and manage how it renews.
          </Text>
        </View>

        {loadState === 'loading' ? (
          <View className="items-center py-12 gap-y-3">
            <ActivityIndicator color="#5A7A5A" />
            <Text className="text-ink-300 text-sm">Loading your subscription...</Text>
          </View>
        ) : loadState === 'error' ? (
          <View className="bg-white rounded-2xl border border-sand-200 p-5 items-center gap-y-4">
            <Text className="text-ink-700 font-medium text-base">Could not load your plan</Text>
            <Text className="text-ink-300 text-sm text-center leading-relaxed">
              Check your connection and try again.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => loadSubscription()}
              className="self-stretch bg-sage-600 rounded-2xl py-3.5 items-center active:bg-sage-700"
              style={{
                minHeight: responsive.isTablet ? responsive.scaleControl(48) : undefined,
                justifyContent: 'center',
              }}
            >
              <Text className="text-pure-white text-sm font-semibold">Try again</Text>
            </Pressable>
          </View>
        ) : isActive ? (
          <>
            <View className="bg-white rounded-2xl border border-sand-200 overflow-hidden mb-4">
              <View className="px-5 py-5 border-b border-sand-100">
                <View className="flex-row items-start justify-between gap-x-4">
                  <View className="flex-1">
                    <Text className="text-xs font-medium text-ink-300 uppercase tracking-widest mb-2">
                      Current plan
                    </Text>
                    <Text className="text-ink-900 text-lg font-semibold">{planName}</Text>
                    <Text className="text-ink-300 text-xs mt-1">
                      {isTrial ? 'Free trial' : 'Premium membership'}
                    </Text>
                  </View>
                  <View className={`rounded-full px-3 py-1.5 ${hasBillingIssue ? 'bg-red-50' : 'bg-sand-100'}`}>
                    <Text className={`text-xs font-semibold ${hasBillingIssue ? 'text-red-400' : 'text-sage-600'}`}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="px-5 py-4 flex-row items-center gap-x-3 border-b border-sand-100">
                <CalendarDaysIcon size={responsive.scaleControl(19)} color="#5A7A5A" />
                <View className="flex-1">
                  <Text className="text-ink-300 text-xs">{expiresOn ? dateLabel : 'Plan access'}</Text>
                  <Text className="text-ink-700 text-sm font-medium mt-0.5">
                    {expiresOn ?? 'Lifetime access'}
                  </Text>
                </View>
              </View>

              <View className="px-5 py-4 flex-row items-center gap-x-3">
                <CheckCircleIcon size={responsive.scaleControl(19)} color="#5A7A5A" />
                <View className="flex-1">
                  <Text className="text-ink-300 text-xs">Purchased through</Text>
                  <Text className="text-ink-700 text-sm font-medium mt-0.5">
                    {isFamilyShared ? `${provider} - Family shared` : provider}
                  </Text>
                </View>
              </View>
            </View>

            {hasBillingIssue && (
              <View className="bg-red-50 rounded-2xl px-4 py-3 mb-4">
                <Text className="text-red-400 text-sm text-center leading-relaxed">
                  There is a problem with your payment method. Update it in {provider} to keep Premium active.
                </Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !managementUrl || openingStore }}
              disabled={!managementUrl || openingStore}
              onPress={openSubscriptionManagement}
              className={`min-h-14 rounded-2xl px-5 py-4 flex-row items-center justify-center gap-x-2 ${
                managementUrl ? 'bg-sage-600 active:bg-sage-700' : 'bg-sand-200'
              }`}
              style={{
                minHeight: responsive.isTablet ? responsive.scaleControl(56) : undefined,
              }}
            >
              {openingStore ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text className={`text-base font-semibold ${managementUrl ? 'text-pure-white' : 'text-ink-300'}`}>
                    {managementButtonLabel(entitlement?.store)}
                  </Text>
                  <ArrowTopRightOnSquareIcon size={responsive.scaleControl(18)} color={managementUrl ? '#FFFFFF' : '#9B9189'} />
                </>
              )}
            </Pressable>

            {!managementUrl && (
              <Text className="text-ink-300 text-xs text-center leading-relaxed mt-3 px-4">
                Subscription settings are not available for this plan on this device.
              </Text>
            )}
          </>
        ) : (
          <View className="bg-white rounded-2xl border border-sand-200 p-5 items-center mb-4">
            <View className="w-12 h-12 rounded-full bg-sand-100 items-center justify-center mb-4">
              <CreditCardIcon size={responsive.scaleControl(22)} color="#5A7A5A" />
            </View>
            <Text className="text-ink-900 text-lg font-semibold text-center">No active subscription</Text>
            <Text className="text-ink-300 text-sm text-center leading-relaxed mt-2 mb-5">
              Choose a Premium plan to unlock AI reminders, detailed insights, and the heatmap widget.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace('/paywall')}
              className="self-stretch bg-sage-600 rounded-2xl py-4 items-center active:bg-sage-700"
              style={{
                minHeight: responsive.isTablet ? responsive.scaleControl(52) : undefined,
                justifyContent: 'center',
              }}
            >
              <Text className="text-pure-white text-base font-semibold">View Premium plans</Text>
            </Pressable>
          </View>
        )}

        {loadState === 'ready' && (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: restoring }}
              disabled={restoring}
              onPress={handleRestore}
              className="flex-row items-center justify-center gap-x-2 py-4 active:opacity-60"
              style={{
                minHeight: responsive.isTablet ? responsive.scaleControl(48) : undefined,
              }}
            >
              {restoring
                ? <ActivityIndicator color="#5A7A5A" size="small" />
                : <ArrowPathIcon size={responsive.scaleControl(17)} color="#5A7A5A" />}
              <Text className="text-sage-600 text-sm font-medium">Restore purchases</Text>
            </Pressable>

            <Text className="text-ink-300 text-xs text-center leading-relaxed px-5 mt-2">
              Payments, plan changes, and cancellations are securely handled by the store where you subscribed.
            </Text>
          </>
        )}
        </ResponsiveContent>
      </ScrollView>

      <AppDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        tone={dialog?.tone}
        onDismiss={() => setDialog(null)}
        actions={[{ label: 'OK', onPress: () => setDialog(null) }]}
      />
    </SafeAreaView>
  );
}
