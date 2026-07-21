import * as Location from 'expo-location';

const LOCATION_RETRY_DELAY_MS = 750;

export type DeviceCoordinates = {
  latitude: number;
  longitude: number;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Requests foreground access when needed and allows Android's location provider
 * a brief moment to become available after the permission prompt closes.
 */
export async function getDeviceLocation(): Promise<DeviceCoordinates | null> {
  let permission = await Location.getForegroundPermissionsAsync();

  if (permission.status !== 'granted') {
    permission = await Location.requestForegroundPermissionsAsync();
  }

  if (permission.status !== 'granted') {
    return null;
  }

  const lastKnown = await Location.getLastKnownPositionAsync();
  if (lastKnown) {
    return {
      latitude: lastKnown.coords.latitude,
      longitude: lastKnown.coords.longitude,
    };
  }

  try {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });
    return {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };
  } catch {
    await delay(LOCATION_RETRY_DELAY_MS);
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });
    return {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };
  }
}
