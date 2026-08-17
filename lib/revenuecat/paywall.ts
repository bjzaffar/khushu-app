import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';

export type PaywallBillingPeriod = 'monthly' | 'annual';

function packageIdentity(aPackage: PurchasesPackage): string {
  return [
    aPackage.identifier,
    aPackage.packageType,
    aPackage.product.identifier,
  ].join(' ').toLowerCase();
}

/** Resolves the two recurring plans Khushu supports, including custom RC packages. */
export function billingPeriodForPackage(
  aPackage: PurchasesPackage
): PaywallBillingPeriod | null {
  const subscriptionPeriod = aPackage.product.subscriptionPeriod?.toUpperCase();
  const identity = packageIdentity(aPackage);

  if (aPackage.packageType === 'MONTHLY' || subscriptionPeriod === 'P1M' || identity.includes('month')) {
    return 'monthly';
  }
  if (
    aPackage.packageType === 'ANNUAL'
    || subscriptionPeriod === 'P1Y'
    || identity.includes('annual')
    || identity.includes('year')
  ) {
    return 'annual';
  }
  return null;
}

/** Returns at most one monthly and one annual package in a predictable order. */
export function selectPaywallPackages(offering: PurchasesOffering): PurchasesPackage[] {
  const candidates = [
    offering.monthly,
    offering.annual,
    ...offering.availablePackages,
  ].filter((candidate): candidate is PurchasesPackage => candidate !== null);

  const byPeriod = new Map<PaywallBillingPeriod, PurchasesPackage>();
  for (const candidate of candidates) {
    const period = billingPeriodForPackage(candidate);
    if (period && !byPeriod.has(period)) byPeriod.set(period, candidate);
  }

  return (['monthly', 'annual'] as const)
    .map((period) => byPeriod.get(period))
    .filter((candidate): candidate is PurchasesPackage => candidate !== undefined);
}

export function packageTitle(aPackage: PurchasesPackage): string {
  const period = billingPeriodForPackage(aPackage);
  if (period === 'monthly') return 'Monthly';
  if (period === 'annual') return 'Annual';
  return aPackage.product.title || 'Premium';
}

export function packagePriceSuffix(aPackage: PurchasesPackage): string {
  const period = billingPeriodForPackage(aPackage);
  if (period === 'monthly') return '/ month';
  if (period === 'annual') return '/ year';
  return '';
}

export function packageRenewalCopy(aPackage: PurchasesPackage): string {
  const period = billingPeriodForPackage(aPackage);
  if (period === 'monthly') {
    return `Renews automatically at ${aPackage.product.priceString} per month until cancelled.`;
  }
  if (period === 'annual') {
    return `Renews automatically at ${aPackage.product.priceString} per year until cancelled.`;
  }
  return `Renews automatically at ${aPackage.product.priceString} until cancelled.`;
}

export function annualSavingsPercent(
  annualPackage: PurchasesPackage,
  monthlyPackage: PurchasesPackage | undefined
): number | null {
  if (!monthlyPackage) return null;
  if (annualPackage.product.currencyCode !== monthlyPackage.product.currencyCode) return null;

  const monthlyAnnualized = monthlyPackage.product.price * 12;
  if (monthlyAnnualized <= 0 || annualPackage.product.price >= monthlyAnnualized) return null;

  const percentage = Math.round((1 - annualPackage.product.price / monthlyAnnualized) * 100);
  return percentage > 0 ? percentage : null;
}
