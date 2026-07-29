import type { CustomerInfo } from 'react-native-purchases';
import type { PremiumStatus } from '@/store/appStore';

export const PREMIUM_ENTITLEMENT_ID = 'premium';

/** Maps RevenueCat's current entitlement snapshot to the only paid-access state. */
export function premiumStatusFromCustomerInfo(
  customerInfo: CustomerInfo | null | undefined
): PremiumStatus {
  return customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID]
    ? 'premium'
    : 'free';
}
