import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import { useAppStore } from '@/store/appStore';
import { premiumStatusFromCustomerInfo } from '@/lib/revenuecat/entitlements';
import { selectRevenueCatApiKey } from '@/lib/revenuecat/config';

export type RevenueCatPackage = PurchasesPackage;
export type RevenueCatOffering = PurchasesOffering;

let configured = false;
let customerInfoListenerRegistered = false;

function getRevenueCatApiKey(): string | null {
  return selectRevenueCatApiKey(
    Platform.OS,
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
    {
      android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
      ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      testStore: process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY,
    }
  );
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
  try {
    await getRevenueCatCustomerInfo();
  } catch (error) {
    // The SDK's cached CustomerInfo remains its only offline source. Never
    // promote access after a failed refresh.
    console.warn('[revenuecat] CustomerInfo refresh failed:', error);
    useAppStore.getState().setPremiumStatus('free');
  }
}

/** Returns the latest subscription snapshot and keeps the app entitlement in sync. */
export async function getRevenueCatCustomerInfo(): Promise<CustomerInfo | null> {
  if (!await configureRevenueCat()) return null;
  const customerInfo = await Purchases.getCustomerInfo();
  applyCustomerInfo(customerInfo);
  return customerInfo;
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
): Promise<boolean> {
  if (!await configureRevenueCat()) {
    throw new Error('RevenueCat is not configured for this platform.');
  }
  const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
  applyCustomerInfo(customerInfo);
  return premiumStatusFromCustomerInfo(customerInfo) === 'premium';
}

export async function restoreRevenueCatPurchases(): Promise<boolean> {
  if (!await configureRevenueCat()) return false;
  const customerInfo = await Purchases.restorePurchases();
  applyCustomerInfo(customerInfo);
  return premiumStatusFromCustomerInfo(customerInfo) === 'premium';
}

export function isRevenueCatPurchaseCancellation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (
      ('userCancelled' in error && (error as { userCancelled?: unknown }).userCancelled === true)
      || ('code' in error && String((error as { code?: unknown }).code) === '1')
    );
}

export function revenueCatPurchaseErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : null;

  if (code === '3') return 'Purchases are not allowed for this store account or device.';
  if (code === '5') return 'This subscription is not available in your current store region.';
  if (code === '6') return 'This store account already owns the subscription. Try Restore purchases.';
  if (code === '10' || code === '32' || code === '35') {
    return 'Could not connect to the store. Check your connection and try again.';
  }
  if (code === '20') return 'Your payment is pending. Premium will activate after the store confirms it.';
  if (code === '23') return 'Subscriptions are not configured correctly for this build.';
  return 'The purchase could not be completed. Please try again.';
}
