import { describe, expect, it } from 'vitest';
import { selectRevenueCatApiKey } from './config';

const keys = {
  android: 'goog_android_key',
  ios: 'appl_ios_key',
  testStore: 'test_store_key',
};

describe('RevenueCat API key selection', () => {
  it('uses only the Test Store key inside Expo Go', () => {
    expect(selectRevenueCatApiKey('android', true, keys)).toBe('test_store_key');
    expect(selectRevenueCatApiKey('ios', true, keys)).toBe('test_store_key');
  });

  it('does not fall back to a native store key in Expo Go', () => {
    expect(selectRevenueCatApiKey('android', true, { android: keys.android })).toBeNull();
  });

  it('uses platform store keys outside Expo Go', () => {
    expect(selectRevenueCatApiKey('android', false, keys)).toBe('goog_android_key');
    expect(selectRevenueCatApiKey('ios', false, keys)).toBe('appl_ios_key');
    expect(selectRevenueCatApiKey('web', false, keys)).toBeNull();
  });
});
