import * as ExpoLocation from 'expo-location';
import type { Location } from '@/types';

export const LOCATION_LABEL_SETTING_KEY = 'location_label';

type AddressParts = Pick<
  ExpoLocation.LocationGeocodedAddress,
  'city' | 'district' | 'subregion' | 'region' | 'country'
>;

/** Pick the most useful short place name returned by the device geocoder. */
export function formatLocationLabel(address: AddressParts | null | undefined): string | null {
  if (!address) return null;

  for (const value of [
    address.city,
    address.district,
    address.subregion,
    address.region,
    address.country,
  ]) {
    const label = value?.trim();
    if (label) return label;
  }

  return null;
}

/** Reverse geocoding is best-effort: valid coordinates remain usable if it fails. */
export async function resolveLocationLabel(location: Location): Promise<string | null> {
  try {
    const [address] = await ExpoLocation.reverseGeocodeAsync(location);
    return formatLocationLabel(address);
  } catch {
    return null;
  }
}
