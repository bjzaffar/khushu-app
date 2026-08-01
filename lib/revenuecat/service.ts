import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { useAppStore } from '@/store/appStore';
import { premiumStatusFromCustomerInfo } from '@/lib/revenuecat/entitlements';

export type RevenueCatPackage = PurchasesPackage;
export type RevenueCatOffering = PurchasesOffering;

let configured = false;
let customerInfoListenerRegistered = false;

function getRevenueCatApiKey(): string | null {
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || null;
  }

  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || null;
  }

  return null;
}

function applyCustomerInfo(customerInfo: CustomerInfo): void {
  useAppStore.getState().setPremiumStatus(premiumStatusFromCustomerInfo(customerInfo));
}

function registerCustomerInfoListener(): void {
  if (customerInfoListenerRegistered) return;
  Purchases.addCustomerInfoUpdateListener(applyCustomerInfo);
  customerInfoListenerRegistered = true;
}

/**
 * Configures the native SDK once for a native purchase surface. A missing public
 * SDK key leaves that platform safely locked rather than attempting a purchase.
 */
export async function configureRevenueCat(): Promise<boolean> {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    useAppStore.getState().setPremiumStatus('free');
    return false;
  }

  if (configured || await Purchases.isConfigured().catch(() => false)) {
    configured = true;
    registerCustomerInfoListener();
    return true;
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey });
  configured = true;

  registerCustomerInfoListener();

  return true;
}

export async function identifyRevenueCatUser(userId: string): Promise<void> {
  if (!await configureRevenueCat()) return;

  useAppStore.getState().setPremiumStatus('unknown');
  const { customerInfo } = await Purchases.logIn(userId);
  applyCustomerInfo(customerInfo);
}

export async function refreshPremiumStatus(): Promise<void> {
  if (!await configureRevenueCat()) return;

  try {
    applyCustomerInfo(await Purchases.getCustomerInfo());
  } catch (error) {
    // The SDK's cached CustomerInfo remains its only offline source. Never
    // promote access after a failed refresh.
    console.warn('[revenuecat] CustomerInfo refresh failed:', error);
    useAppStore.getState().setPremiumStatus('free');
  }
}

export async function clearRevenueCatUser(): Promise<void> {
  // Lock immediately so another account can never see the previous account's access.
  useAppStore.getState().setPremiumStatus('free');
  if (!configured && !await Purchases.isConfigured().catch(() => false)) return;

  try {
    await Purchases.logOut();
  } catch (error) {
    console.warn('[revenuecat] logout failed:', error);
  }
}

export async function getCurrentRevenueCatOffering(): Promise<RevenueCatOffering | null> {
  if (!await configureRevenueCat()) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current;
}

export async function purchaseRevenueCatPackage(
  selectedPackage: RevenueCatPackage
): Promise<void> {
  const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
  applyCustomerInfo(customerInfo);
}

export async function restoreRevenueCatPurchases(): Promise<boolean> {
  if (!await configureRevenueCat()) return false;
  const customerInfo = await Purchases.restorePurchases();
  applyCustomerInfo(customerInfo);
  return premiumStatusFromCustomerInfo(customerInfo) === 'premium';
}

export async function openRevenueCatCustomerCenter(): Promise<void> {
  if (!await configureRevenueCat()) return;
  await RevenueCatUI.presentCustomerCenter({
    callbacks: {
      onRestoreCompleted: ({ customerInfo }) => applyCustomerInfo(customerInfo),
    },
  });
  await refreshPremiumStatus();
}

export function isRevenueCatPurchaseCancellation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'userCancelled' in error
    && (error as { userCancelled?: unknown }).userCancelled === true;
}
