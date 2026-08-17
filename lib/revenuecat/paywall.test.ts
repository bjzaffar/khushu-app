import { describe, expect, it } from 'vitest';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import {
  annualSavingsPercent,
  billingPeriodForPackage,
  packageRenewalCopy,
  selectPaywallPackages,
} from './paywall';

function makePackage({
  identifier,
  packageType = 'CUSTOM',
  subscriptionPeriod,
  price = 1.99,
  priceString = '£1.99',
  currencyCode = 'GBP',
}: {
  identifier: string;
  packageType?: string;
  subscriptionPeriod?: string | null;
  price?: number;
  priceString?: string;
  currencyCode?: string;
}): PurchasesPackage {
  return {
    identifier,
    packageType,
    product: {
      identifier,
      subscriptionPeriod: subscriptionPeriod ?? null,
      price,
      priceString,
      currencyCode,
      title: 'Khushu Premium',
    },
  } as PurchasesPackage;
}

function makeOffering(packages: PurchasesPackage[]): PurchasesOffering {
  return {
    monthly: packages.find((item) => billingPeriodForPackage(item) === 'monthly') ?? null,
    annual: packages.find((item) => billingPeriodForPackage(item) === 'annual') ?? null,
    availablePackages: packages,
  } as PurchasesOffering;
}

describe('RevenueCat paywall packages', () => {
  it('recognises predefined and custom monthly and annual packages', () => {
    expect(billingPeriodForPackage(makePackage({ identifier: '$rc_monthly', packageType: 'MONTHLY' }))).toBe('monthly');
    expect(billingPeriodForPackage(makePackage({ identifier: 'premium', subscriptionPeriod: 'P1Y' }))).toBe('annual');
    expect(billingPeriodForPackage(makePackage({ identifier: 'weekly', subscriptionPeriod: 'P1W' }))).toBeNull();
  });

  it('selects one monthly and annual package and ignores unsupported periods', () => {
    const monthly = makePackage({ identifier: 'monthly', subscriptionPeriod: 'P1M' });
    const annual = makePackage({ identifier: 'annual', subscriptionPeriod: 'P1Y' });
    const weekly = makePackage({ identifier: 'weekly', subscriptionPeriod: 'P1W' });

    expect(selectPaywallPackages(makeOffering([weekly, annual, monthly]))).toEqual([monthly, annual]);
  });

  it('calculates annual savings only in the same currency', () => {
    const monthly = makePackage({ identifier: 'monthly', price: 2, currencyCode: 'GBP' });
    const annual = makePackage({ identifier: 'annual', price: 18, currencyCode: 'GBP' });
    const foreignAnnual = makePackage({ identifier: 'annual', price: 18, currencyCode: 'USD' });

    expect(annualSavingsPercent(annual, monthly)).toBe(25);
    expect(annualSavingsPercent(foreignAnnual, monthly)).toBeNull();
  });

  it('uses the localized store price in renewal disclosure', () => {
    const monthly = makePackage({
      identifier: 'monthly',
      subscriptionPeriod: 'P1M',
      priceString: 'PKR 500',
      currencyCode: 'PKR',
    });

    expect(packageRenewalCopy(monthly)).toBe('Renews automatically at PKR 500 per month until cancelled.');
  });
});
