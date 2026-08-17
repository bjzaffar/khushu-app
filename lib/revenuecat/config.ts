export interface RevenueCatApiKeys {
  android?: string;
  ios?: string;
  testStore?: string;
}

function presentKey(value: string | undefined): string | null {
  return value?.trim() || null;
}

/** Select a key that belongs to the store available in the current runtime. */
export function selectRevenueCatApiKey(
  platform: string,
  isExpoGo: boolean,
  keys: RevenueCatApiKeys
): string | null {
  if (isExpoGo) return presentKey(keys.testStore);
  if (platform === 'android') return presentKey(keys.android);
  if (platform === 'ios') return presentKey(keys.ios);
  return null;
}
