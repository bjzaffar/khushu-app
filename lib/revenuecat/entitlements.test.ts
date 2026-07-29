import { describe, expect, it } from 'vitest';
import { PREMIUM_ENTITLEMENT_ID, premiumStatusFromCustomerInfo } from './entitlements';

describe('premiumStatusFromCustomerInfo', () => {
  it('returns premium only for the active premium entitlement', () => {
    const customerInfo = {
      entitlements: {
        active: { [PREMIUM_ENTITLEMENT_ID]: { id: PREMIUM_ENTITLEMENT_ID } },
      },
    };

    expect(premiumStatusFromCustomerInfo(customerInfo as never)).toBe('premium');
  });

  it.each([
    undefined,
    null,
    {},
    { entitlements: { active: {} } },
    { entitlements: { active: { expired: { id: 'expired' } } } },
  ])('returns free for missing, malformed, or inactive entitlement data', (customerInfo) => {
    expect(premiumStatusFromCustomerInfo(customerInfo as never)).toBe('free');
  });
});
